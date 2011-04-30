var fs = require('fs');
var path = require('path');
var dns = require('dns');
var utils = require('./utils');
var Address = require('./address').Address;

var MAX_UNIQ = 10000;
var host = require('os').hostname().replace(/\\/, '\\057').replace(/:/, '\\072');
var fn_re = /^(\d+)_(\d+)_/; // I like how this looks like a person

function HMailItem (filename, path) {
    var matches = filename.match(fn_re);
    if (!matches) {
        throw new Error("Bad filename: " + filename);
    }
    this.path     = path;
    this.filename = filename;
    this.next_process = matches[1];
    this.num_failures = matches[2];
    var  ready        = 0;
    this.ready_cb     = function () { ready = 1 };
    this.is_ready     = function () { return ready };
    
    this.size_file();
}

HMailItem.prototype.data_stream = function () {
    return fs.createReadStream(this.path, {start: this.data_start, end: this.file_size});
}

HMailItem.prototype.size_file = function () {
    var self = this;
    fs.stat(self.path, function (err, stats) {
        if (err) {
            // we are fucked... guess I need somewhere for this to go
        }
        else {
            self.file_size = stats.size;
            self.read_todo();
        }
    });
}

HMailItem.prototype.read_todo = function () {
    var self = this;
    var tl_reader = fs.createReadStream(self.path, {start: 0, end: 3});
    tl_reader.on('data', function (buf) {
        // I'm making the assumption here we won't ever read less than 4 bytes
        // as no filesystem on the planet should be that dumb...
        tl_reader.destroy();
        var todo_len = (buf[0] << 24) + (buf[1] << 16) + (buf[2] << 8) + buf[3];
        var td_reader = fs.createReadStream(self.path, {encoding: 'utf8', start: 4, end: todo_len + 3});
        self.data_start = todo_len + 4;
        var todo = '';
        td_reader.on('data', function (str) {
            todo += str;
            if (todo.length === todo_len) {
                // we read everything
                todo = JSON.parse(todo);
                self.todo = todo;
                self.ready_cb();
            }
        });
    });
}

exports.register = function () {
    this.queue_dir = path.resolve(this.config.get('deliver.queue_dir') || './queue');
    this.uniq = Math.round(Math.random() * MAX_UNIQ);
    
    // no reason not to do this stuff syncronously - we're just loading here
    if (!path.existsSync(this.queue_dir)) {
        try {
            fs.mkdirSync(this.queue_dir, 0755   );
        }
        catch (err) {
            if (err.code != 'EEXIST') {
                throw err;
            }
        }
    }
    
    this._load_cur_queue("_add_file");
}

exports._next_uniq = function () {
    var result = this.uniq++;
    if (this.uniq >= 10000) {
        this.uniq = 1;
    }
    return result;
}

exports._fname = function () {
    var time = new Date().getTime();
    return time + '_0_' + process.pid + "_" + this._next_uniq() + '.' + host;
}

function get_mx (domain, cb) {
    var mxs = [];
    
    // Possible DNS errors
    // NODATA
    // FORMERR
    // BADRESP
    // NOTFOUND
    // BADNAME
    // TIMEOUT
    // CONNREFUSED
    // NOMEM
    // DESTRUCTION
    // NOTIMP
    // EREFUSED
    // SERVFAIL
    
    var wrap_mx = function (a) { return a };
    var process_dns = function (err, addresses) {
        if (err) {
            cb(err);
        }
        else if (addresses && addresses.length) {
            for (var i=0,l=addresses.length; i < l; i++) {
                mxs.push(wrap_mx(addresses[i]));
            }
            cb(null, mxs);
        }
        else {
            return 0;
        }
        return 1;
    };
    
    dns.resolveMx(domain, function(err, addresses) {
        if (process_dns(err, addresses)) {
            return;
        }
        wrap_mx = function (a) { return {priority:0,exchange:a} };
        dns.resolve(domain, function(err, addresses) {
            if (process_dns(err, addresses)) {
                return;
            }
            var err = new Error("Found nowhere to deliver to");
            err.code = 'NOMX';
            cb(err);
        });
    });
}

exports.hook_queue = function (next, connection) {
    if (!connection.relaying) {
        next(); // we're not relaying so don't deliver outbound
    }
    
    var self = this;
    
    // First get each domain
    var recips = {};
    connection.transaction.rcpt_to.forEach(function (item) {
        var domain = item.host;
        recips[domain] = recips[domain] || [];
        recips[domain].push(item);
    });
    
    // we need to create a "mynext" because as we split the mail if one
    // of them fails we need to fail all of them. Also if one succeeds we
    // don't want to return next(OK) until the last one succeeded.
    var hmails = [];
    var ok_paths = [];
    var next_sent = 0;
    var num_domains = Object.keys(recips).length;
    var mynext = function (path, code, msg) {
        if (next_sent) {
            // means a DENY next() has been sent. Unlink everything...
            for (var i=0,l=ok_paths.length; i<l; i++) {
                fs.unlink(ok_paths[i]);
            }
            fs.unlink(path);
        }
        else if (code === DENY) {
            // unlink everything sent before.
            for (var i=0,l=ok_paths.length; i<l; i++) {
                fs.unlink(ok_paths[i]);
            }
            ok_paths = [];
            fs.unlink(path);
            next_sent = 1;
            next(code, msg);
        }
        else if (num_domains === 1) {
            for (var i=0,l=hmails.length; i < l; i++) {
                var hmail = hmails[i];
                setTimeout(function () {self.send_email(hmail)}, 0);
            }
            next(code, msg);
        }
        else {
            ok_paths.push(path);
        }
        num_domains--;
    }
    
    for (var dom in recips) {
        this.process_domain(dom, recips, hmails, mynext, next, connection);
    }
}

exports.process_domain = function (dom, recips, hmails, mynext, next, connection) {
    var plugin = this;
    var fname = this._fname();
    var tmp_path = path.join(this.queue_dir, '.' + fname);
    var ws = fs.createWriteStream(tmp_path);
    var data_pos = 0;
    var write_more = function () {
        if (data_pos === connection.transaction.data_lines.length) {
            ws.on('close', function () {
                var dest_path = path.join(plugin.queue_dir, fname);
                fs.rename(tmp_path, dest_path, function (err) {
                    if (err) {
                        plugin.logerror("Unable to rename tmp file!: " + err);
                        mynext(tmp_path, DENY, "Queue error");
                    }
                    else {
                        hmails.push(new HMailItem (fname, dest_path));
                        mynext(tmp_path, OK, "Queued!");
                    }
                });
            });
            ws.destroy();
            return;
        }
    
        if (ws.write(connection.transaction.data_lines[data_pos++])) {
            write_more();
        }
    };

    ws.on('error', function (err) {
        plugin.logerror("Unable to write queue file (" + fname + "): " + err);
        ws.destroy();
        mynext(tmp_path, DENY, "Queueing failed");
    });

    ws.on('drain', write_more);

    plugin.build_todo(dom, recips, ws, write_more, connection);
}

exports.build_todo = function (dom, recips, ws, write_more, connection) {
    var todo_str = JSON.stringify(
        {
            domain: dom,
            mail_from: connection.transaction.mail_from,
            rcpt_to:   recips[dom],
        }
    );
    
    // since JS has no pack() we have to manually write the bytes of a long
    var todo_length = new Buffer(4);
    var todo_l = todo_str.length;
    todo_length[3] = todo_str.length & 0xff;
    todo_length[2] = (todo_str.length >> 8) & 0xff;
    todo_length[1] = (todo_str.length >> 16) & 0xff;
    todo_length[0] = (todo_str.length >> 24) & 0xff;
    
    ws.write(todo_length);
    if (ws.write(todo_str)) {
        // if write() above returned false, the 'drain' event will be called
        // later anyway to call write_more_data()
        write_more();
    }
}

exports._load_cur_queue = function (cb_name) {
    var files = fs.readdirSync(this.queue_dir);
    
    
    this.cur_time = new Date(); // set this once so we're not calling it a lot

    for (var i=0,l=files.length; i < l; i++) {
        try {
            var hmail = new HMailItem(files[i], path.join(this.queue_dir, files[i]));
            this[cb_name](hmail);
        }
        catch (err) {
            this.logwarn("Warning processing queue directory: " + err);
        }
    }
}

exports._add_file = function (hmail) {
    var self = this;
    this.loginfo("Adding file: " + hmail.filename);
    setTimeout(function () { self.send_email(hmail) }, hmail.next_process - this.cur_time);
}

exports.send_email = function (hmail) {
    this.loginfo("Sending mail: " + hmail.filename);
    if (!hmail.is_ready()) {
        // haven't finished reading the todo, delay here...
        this.loginfo("Waiting until todo is loaded...");
        var self = this;
        hmail.ready_cb = function () { self._send_email(hmail) }
        return;
    }
    
    this._send_email(hmail);
}

var util = require('util');

exports._send_email = function (hmail) {
    var plugin = this;
    plugin.loginfo("Hmail: " + util.inspect(hmail, null, null));
    
    get_mx(hmail.todo.domain, function (err, mxs) {
        if (err) {
            self.logerror("MX Lookup for " + dom + " failed: " + err);
            if (err.code === dns.NXDOMAIN) {
                plugin.bounce("No Such Domain", hmail);
            }
            else if (err.code === 'NOMX') {
                plugin.bounce("Nowhere to deliver mail to", hmail);
            }
            else {
                // every other error is transient
                plugin.temp_fail(hmail);
            }
        }
        else {
            // got MXs
            plugin.loginfo(mxs);
        }
    });
}

exports.bounce = function (err, hmail) {
}

exports.temp_fail = function (hmail) {
    var plugin = this;
    hmail.num_failures++;
    
    if (hmail.num_failures >= 13) {
        return this.bounce("Too many failures", hmail);
    }

    // basic strategy is we exponentially grow the delay to the power
    // two each time, starting at 2 ** 6 seconds
    
    // Note: More advanced options should be explored in the future as the
    // last delay is 2**17 secs (1.5 days), which is a bit long... Exim has a max delay of
    // 6 hours (configurable) and the expire time is also configurable... But
    // this is good enough for now.
    
    var delay = (Math.pow(2, (hmail.num_failures + 5)) * 1000);
    var until = new Date().getTime() + delay;
    
    this.loginfo("Temp failing " + hmail.filename + " for " + (delay/1000) + " seconds");
    
    var new_filename = hmail.filename.replace(/^(\d+)_(\d+)_/, until + '_' + hmail.num_failures + '_');
    
    fs.rename(hmail.path, path.join(this.queue_dir, new_filename), function (err) {
        if (err) {
            return plugin.bounce("Error re-queueing email: " + err, hmail);
        }
        setTimeout(function () {plugin.send_email(hmail)}, delay);
    });
}
