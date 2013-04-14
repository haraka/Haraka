"use strict";
var fs          = require('fs');
var path        = require('path');
var dns         = require('dns');
var net         = require('net');
var util        = require("util");
var events      = require("events");
var utils       = require('./utils');
var sock        = require('./line_socket');
var server      = require('./server');
var logger      = require('./logger');
var config      = require('./config');
var constants   = require('./constants');
var trans       = require('./transaction');
var plugins     = require('./plugins');
var async       = require('async');
var Address     = require('./address').Address;
var date_to_str = utils.date_to_str;
var existsSync  = utils.existsSync;

var core_consts = require('constants');
var WRITE_EXCL  = core_consts.O_CREAT | core_consts.O_TRUNC | core_consts.O_WRONLY | core_consts.O_EXCL;

var delivery_concurrency = 0;

var DENY = constants.deny;
var OK   = constants.ok;

var MAX_UNIQ = 10000;
var host = require('os').hostname().replace(/\\/, '\\057').replace(/:/, '\\072');
var fn_re = /^(\d+)_(\d+)_/; // I like how this looks like a person

var queue_dir = path.resolve(config.get('queue_dir') || (process.env.HARAKA + '/queue'));
var uniq = Math.round(Math.random() * MAX_UNIQ);
var max_concurrency = config.get('outbound.concurrency_max') || 100;
var queue_count = 0;

exports.list_queue = function () {
    this._load_cur_queue("_list_file");
}

exports.stat_queue = function () {
    this._load_cur_queue("_stat_file");
    return this.stats();
}

exports.load_queue = function () {
    // Initialise and load queue

    // we create the dir here because this is used when Haraka is running
    // properly.

    // no reason not to do this stuff syncronously - we're just loading here
    if (!existsSync(queue_dir)) {
        this.logdebug("Creating queue directory " + queue_dir);
        try {
            fs.mkdirSync(queue_dir, 493); // 493 == 0755
        }
        catch (err) {
            if (err.code != 'EEXIST') {
                throw err;
            }
        }
    }

    this._load_cur_queue("_add_file");
}

function _next_uniq () {
    var result = uniq++;
    if (uniq >= MAX_UNIQ) {
        uniq = 1;
    }
    return result;
}

function _fname () {
    var time = new Date().getTime();
    return time + '_0_' + process.pid + "_" + _next_uniq() + '.' + host;
}

exports.send_email = function () {
    if (arguments.length === 2) {
        this.loginfo("Sending email as with a transaction");
        return this.send_trans_email(arguments[0], arguments[1]);
    }

    var self = this;

    var from = arguments[0],
        to   = arguments[1],
        contents = arguments[2];
        var next = arguments[3];

    this.loginfo("Sending email via params");

    var transaction = trans.createTransaction();

    this.loginfo("Created transaction: " + transaction.uuid);

    // set MAIL FROM address, and parse if it's not an Address object
    if (from instanceof Address) {
        transaction.mail_from = from;
    }
    else {
        try {
            from = new Address(from);
        }
        catch (err) {
            return next(DENY, "Malformed from: " + err);
        }
        transaction.mail_from = from;
    }

    // Make sure to is an array
    if (!(Array.isArray(to))) {
        // turn into an array
        to = [ to ];
    }

    if (to.length === 0) {
        return next(DENY, "No recipients for email");
    }

    // Set RCPT TO's, and parse each if it's not an Address object.
    for (var i=0,l=to.length; i < l; i++) {
        if (!(to[i] instanceof Address)) {
            try {
                to[i] = new Address(to[i]);
            }
            catch (err) {
                return next(DENY, "Malformed to address (" + to[i] + "): " + err);
            }
        }
    }

    transaction.rcpt_to = to;


    // Set data_lines to lines in contents
    var match;
    var re = /^([^\n]*\n?)/;
    while (match = re.exec(contents)) {
        var line = match[1];
        line = line.replace(/\n?$/, '\r\n'); // make sure it ends in \r\n
        transaction.add_data(line);
        contents = contents.substr(match[1].length);
        if (contents.length === 0) {
            break;
        }
    }
    transaction.message_stream.add_line_end();
    this.send_trans_email(transaction, next);
}

exports.send_trans_email = function (transaction, next) {
    var self = this;
    
    // add in potentially missing headers
    if (!transaction.header.get_all('Message-Id').length) {
        this.loginfo("Adding missing Message-Id header");
        transaction.add_header('Message-Id', '<' + transaction.uuid + '@' + config.get('me') + '>');
    }
    if (!transaction.header.get_all('Date').length) {
        this.loginfo("Adding missing Date header");
        transaction.add_header('Date', date_to_str(new Date()));
    }

    transaction.add_leading_header('Received', 'via haraka outbound.js at ' + date_to_str(new Date()));
    
    // First get each domain
    var recips = {};
    var num_domains = 0;
    transaction.rcpt_to.forEach(function (item) {
        var domain = item.host;
        if (!recips[domain]) {
            recips[domain] = [];
            num_domains++;
        }
        recips[domain].push(item);
    });
    
    var hmails = [];
    var ok_paths = [];

    async.forEachSeries(Object.keys(recips), function (domain, cb) {
        var todo = new TODOItem(domain, recips[domain], transaction);
        self.process_domain(ok_paths, todo, hmails, cb);
    }, 
    function (err) {
        if (err) {
            for (var i=0,l=ok_paths.length; i<l; i++) {
                fs.unlink(ok_paths[i], function () {});
            }
            if (next) next(DENY, err);
            return;
        }

        for (var i = 0; i < hmails.length; i++) {
            var hmail = hmails[i];
            setTimeout(function (h) {
                return function () { h.send() }
            }(hmail), 0);
        }

        if (next) next(OK, "Mail Queued");
    })
}

exports.process_domain = function (ok_paths, todo, hmails, cb) {
    var plugin = this;
    this.loginfo("Processing domain: " + todo.domain);
    var fname = _fname();
    var tmp_path = path.join(queue_dir, '.' + fname);
    var ws = fs.createWriteStream(tmp_path, { flags: WRITE_EXCL });
    ws.on('close', function () {
        var dest_path = path.join(queue_dir, fname);
        fs.rename(tmp_path, dest_path, function (err) {
            if (err) {
                plugin.logerror("Unable to rename tmp file!: " + err);
                fs.unlink(tmp_path, function () {});
                cb("Queue error");
            }
            else {
                hmails.push(new HMailItem (fname, dest_path, todo.notes));
                ok_paths.push(dest_path);
                cb();
            }
        });
    });
    ws.on('error', function (err) {
        plugin.logerror("Unable to write queue file (" + fname + "): " + err);
        ws.destroy();
        fs.unlink(tmp_path, function () {});
        cb("Queueing failed");
    });
    plugin.build_todo(todo, ws);
    todo.message_stream.pipe(ws, { line_endings: '\r\n', dot_stuffing: true, ending_dot: false });
}

exports.build_todo = function (todo, ws) {
    // Replacer function to exclude items from the queue file header
    function exclude_from_json(key, value) {
        switch (key) {
            case 'message_stream':
                return undefined;
            default:
                return value;
        }
    }
    var todo_str = new Buffer(JSON.stringify(todo, exclude_from_json), 'binary');

    // since JS has no pack() we have to manually write the bytes of a long
    var todo_length = new Buffer(4);
    var todo_l = todo_str.length;
    todo_length[3] = todo_str.length & 0xff;
    todo_length[2] = (todo_str.length >> 8) & 0xff;
    todo_length[1] = (todo_str.length >> 16) & 0xff;
    todo_length[0] = (todo_str.length >> 24) & 0xff;
    
    var buf = Buffer.concat([todo_length, todo_str], todo_str.length + 4);

    ws.write(buf);
}

exports.split_to_new_recipients = function (hmail, recipients, response, cb) {
    var plugin = this;
    var fname = _fname();
    var tmp_path = path.join(queue_dir, '.' + fname);
    var ws = fs.createWriteStream(tmp_path, { flags: WRITE_EXCL });

    var writing = false;

    var write_more = function () {
        if (writing) return;
        writing = true;
        var rs = hmail.data_stream();
        rs.pipe(ws, {end: false});
        rs.on('error', function (err) {
            plugin.logerror("Reading original mail error: " + err);
        })
        rs.on('end', function () {
            ws.on('close', function () {
                var dest_path = path.join(queue_dir, fname);
                fs.rename(tmp_path, dest_path, function (err) {
                    if (err) {
                        plugin.logerror("Unable to rename tmp file!: " + err);
                        hmail.bounce("Error re-queuing some recipients");
                    }
                    else {
                        var split_mail = new HMailItem (fname, dest_path);
                        split_mail.once('ready', function () {
                            cb(split_mail);
                        });
                    }
                });
            });
            ws.destroySoon();
            return;
        });
    }

    ws.on('error', function (err) {
        plugin.logerror("Unable to write queue file (" + fname + "): " + err);
        ws.destroy();
        hmail.bounce("Error re-queueing some recipients");
    });

    ws.on('drain', write_more);

    hmail.todo.rcpt_to = recipients;
    plugin.build_todo(hmail.todo, ws, write_more);
}

exports._load_cur_queue = function (cb_name) {
    var plugin = this;
    plugin.loginfo("Loading outbound queue from ", queue_dir);
    fs.readdir(queue_dir, function (err, files) {
        if (err) {
            return plugin.logerror("Failed to load queue directory (" + queue_dir + "): " + err);
        }
        
        plugin.cur_time = new Date(); // set this once so we're not calling it a lot

        plugin.load_queue_files(cb_name, files);
    });
}

exports.load_queue_files = function (cb_name, files) {
    var plugin = this;
    if (files.length === 0) return;

    this.loginfo("Loading some of the queue...");

    if ((delivery_concurrency >= max_concurrency)
        || config.get('outbound.disabled'))
    {
        // try again in 1 second if delivery is disabled
        setTimeout(function () {plugin.load_queue_files(cb_name, files)}, 1000);
        return;
    }

    for (var i=1; i <= max_concurrency; i++) {
        if (files.length === 0) break;
        var file = files.shift();
        if (/^\./.test(file)) {
            // dot-file...
            continue;
        }
        var hmail = new HMailItem(file, path.join(queue_dir, file));
        this[cb_name](hmail);

        if ((files.length === 0) || (i === max_concurrency)) {
            // end of loop or end of files
            var self = this;
            hmail.once('ready', function () {self.load_queue_files(cb_name, files)});
            break;
        }
    }
}

exports._add_file = function (hmail) {
    var self = this;
    this.loginfo("Adding file: " + hmail.filename);
    setTimeout(function () { hmail.send() }, hmail.next_process - this.cur_time);
}

exports._list_file = function (hmail) {
    // TODO: output more data here
    console.log("Q: " + hmail.filename);
}

exports._get_stats = function (hmail) {
    queue_count++;
}

exports.stats = function () {
    // TODO: output more data here
    var results = {
        queue_dir:   queue_dir,
        queue_count: queue_count,
    };

    return results;
}

// TODOItem - queue file header data
function TODOItem (domain, recipients, transaction) {
    this.domain = domain;
    this.rcpt_to = recipients;
    this.mail_from = transaction.mail_from;
    this.message_stream = transaction.message_stream;
    this.notes = transaction.notes;
    this.uuid = transaction.uuid;
    return this;
}

/////////////////////////////////////////////////////////////////////////////
// HMailItem - encapsulates an individual outbound mail item

function HMailItem (filename, path, notes) {
    events.EventEmitter.call(this);
    var matches = filename.match(fn_re);
    if (!matches) {
        throw new Error("Bad filename: " + filename);
    }
    this.path         = path;
    this.filename     = filename;
    this.next_process = matches[1];
    this.num_failures = matches[2];
    this.notes        = notes || {};
    this.refcount     = 1;

    this.size_file();
}

util.inherits(HMailItem, events.EventEmitter);
exports.HMailItem = HMailItem;

// populate log functions - so we can use hooks
for (var key in logger) {
    if (key.match(/^log\w/)) {
        exports[key] = (function (key) {
            return function () {
                var args = ["[outbound] "];
                for (var i=0, l=arguments.length; i<l; i++) {
                    args.push(arguments[i]);
                }
                logger[key].apply(logger, args);
            }
        })(key);
        HMailItem.prototype[key] = (function (key) {
            return function () {
                var args = [ this ];
                for (var i=0, l=arguments.length; i<l; i++) {
                    args.push(arguments[i]);
                }
                logger[key].apply(logger, args);
            }
        })(key);
    }
}

HMailItem.prototype.data_stream = function () {
    return fs.createReadStream(this.path, {start: this.data_start, end: this.file_size});
}

HMailItem.prototype.size_file = function () {
    var self = this;
    fs.stat(self.path, function (err, stats) {
        if (err) {
            // we are fucked... guess I need somewhere for this to go
            logger.logerror("Error obtaining file size: " + err);
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
                self.emit('ready');
            }
        });
        td_reader.on('error', function (err) {
            logger.logerror("Error reading todo: " + err);
        })
        td_reader.on('end', function () {
            if (todo.length === todo_len) {
                logger.logerror("Didn't find enough data in todo!");
            }
        })
    });
}

HMailItem.prototype.send = function () {
    if (!this.todo) {
        var self = this;
        this.once('ready', function () { self._send() });
    }
    else {
        this._send();
    }
}

HMailItem.prototype._send = function () {
    if ((delivery_concurrency >= max_concurrency)
        || config.get('outbound.disabled'))
    {
        // try again in 1 second if delivery is disabled
        this.logdebug("delivery disabled temporarily. Retrying in 1s.");
        var hmail = this;
        setTimeout(function () {hmail._send()}, 1000);
        return;
    }

    plugins.run_hooks('send_email', this);

}

HMailItem.prototype.send_email_respond = function (retval, delaySeconds) {
    if(retval === constants.delay){
        // Try again in 'delay' seconds.
        this.logdebug("Delivery delayed.");
        var hmail = this;
        setTimeout(function () {hmail._send()}, delaySeconds*1000);
    }else{
        this.logdebug("Sending mail: " + this.filename);
        this.get_mx();
    }
}

HMailItem.prototype.get_mx = function () {
    var domain = this.todo.domain;

    plugins.run_hooks('get_mx', this, domain);
}

HMailItem.prototype.get_mx_respond = function (retval, mx) {
    switch(retval) {
        case constants.ok:
                var mx_list;
                if (Array.isArray(mx)) {
                    mx_list = mx;
                }
                else if (typeof mx === "object") {
                    mx_list = [mx];
                }
                else {
                    // assume string
                    var matches = /^(.*?)(:(\d+))?$/.exec(mx);
                    if (!matches) {
                        throw("get_mx returned something that doesn't match hostname or hostname:port");
                    }
                    mx_list = [{priority: 0, exchange: matches[1], port: matches[3]}];
                }
                this.logdebug("Got an MX from Plugin: " + this.todo.domain + " => 0 " + mx);
                return this.found_mx(null, mx_list);
        case constants.deny:
                this.logwarn("get_mx plugin returned DENY: " + mx);
                return this.bounce("No MX for " + this.domain);
        case constants.denysoft:
                this.logwarn("get_mx plugin returned DENYSOFT: " + mx);
                return this.temp_fail("Temporary MX lookup error for " + this.domain);
    }

    var hmail = this;
    // if none of the above return codes, drop through to this...
    exports.lookup_mx(this.todo.domain, function (err, mxs) {
        hmail.found_mx(err, mxs);
    });
}

exports.lookup_mx = function lookup_mx (domain, cb) {
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
    
    // default wrap_mx just returns our object with "priority" and "exchange" keys
    var wrap_mx = function (a) { return a };
    var process_dns = function (err, addresses) {
        if (err) {
            if (err.code === 'ENODATA') {
                // Most likely this is a hostname with no MX record
                // Drop through and we'll get the A record instead.
                return 0;
            }
            cb(err);
        }
        else if (addresses && addresses.length) {
            for (var i=0,l=addresses.length; i < l; i++) {
                var mx = wrap_mx(addresses[i]);
                // hmail.logdebug("Got an MX from DNS: " + hmail.todo.domain + " => " + mx.priority + " " + mx.exchange);
                mxs.push(mx);
            }
            cb(null, mxs);
        }
        else {
            // return zero if we need to keep trying next option
            return 0;
        }
        return 1;
    };
    
    dns.resolveMx(domain, function(err, addresses) {
        if (process_dns(err, addresses)) {
            return;
        }
        
        // if MX lookup failed, we lookup an A record. To do that we change
        // wrap_mx() to return same thing as resolveMx() does.
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

HMailItem.prototype.found_mx = function (err, mxs) {
    if (err) {
        this.logerror("MX Lookup for " + this.todo.domain + " failed: " + err);
        if (err.code === dns.NXDOMAIN || err.code === 'ENOTFOUND') {
            this.bounce("No Such Domain: " + this.todo.domain);
        }
        else if (err.code === 'NOMX') {
            this.bounce("Nowhere to deliver mail to for domain: " + this.todo.domain);
        }
        else {
            // every other error is transient
            this.temp_fail("DNS lookup failure: " + err);
        }
    }
    else {
        // got MXs
        var mxlist = sort_mx(mxs);
        this.mxlist = mxlist;
        this.try_deliver();
    }
}

// MXs must be sorted by priority order, but matched priorities must be
// randomly shuffled in that list, so this is a bit complex.
function sort_mx (mx_list) {
    var sorted = mx_list.sort(function (a,b) {
        return a.priority - b.priority;
    });
    
    // This isn't a very good shuffle but it'll do for now.
    for (var i=0,l=sorted.length-1; i<l; i++) {
        if (sorted[i].priority === sorted[i+1].priority) {
            if (Math.round(Math.random())) { // 0 or 1
                var j = sorted[i];
                sorted[i] = sorted[i+1];
                sorted[i+1] = j;
            }
        }        
    }
    return sorted;
}

HMailItem.prototype.try_deliver = function () {
    var self = this;
    delivery_concurrency++;

    // check if there are any MXs left
    if (this.mxlist.length === 0) {
        return this.temp_fail("Tried all MXs");
    }
    
    var mx   = this.mxlist.shift();
    var host = mx.exchange;

    // IP or IP:port 
    if (net.isIP(host)) {
        self.hostlist = [ host ];
        return self.try_deliver_host(mx);
    }

    this.loginfo("Looking up A records for: " + host);
 
    // now we have a host, we have to lookup the addresses for that host
    // and try each one in order they appear
    dns.resolve(host, function (err, addresses) {
        if (err) {
            self.logerror("DNS lookup of " + host + " failed: " + err);
            delivery_concurrency--;
            return self.try_deliver(); // try next MX
        }
        if (addresses.length === 0) {
            // NODATA or empty host list
            self.logerror("DNS lookup of " + host + " resulted in no data");
            delivery_concurrency--;
            return self.try_deliver(); // try next MX
        }
        self.hostlist = addresses;
        self.try_deliver_host(mx);
    });
}

var smtp_regexp = /^([0-9]{3})([ -])(.*)/;

HMailItem.prototype.try_deliver_host = function (mx) {
    if (this.hostlist.length === 0) {
        delivery_concurrency--;
        return this.try_deliver(); // try next MX
    }
    
    var host = this.hostlist.shift();
    var port            = mx.port || 25;
    var socket          = sock.connect({port: port, host: host, localAddress: mx.bind});
    var self            = this;
    var processing_mail = true;

    this.loginfo("Attempting to deliver to: " + host + ":" + port + " (" + delivery_concurrency + ")");

    socket.on('error', function (err) {
        self.logerror("Ongoing connection failed: " + err);
        processing_mail = false;
        // try the next MX
        self.try_deliver_host(mx);
    });

    socket.on('close', function () {
        if (processing_mail) {
            return self.try_deliver_host(mx);
        }
    });

    socket.setTimeout(300 * 1000); // TODO: make this configurable
    
    var command = 'connect';
    var response = [];
    
    var recipients = this.todo.rcpt_to.map(function (a) { return new Address (a.original) });

    var mail_from  = new Address (this.todo.mail_from.original);

    var data_marker = 0;
    var last_recip = null;
    var ok_recips = 0;
    var fail_recips = [];
    var bounce_recips = [];
    var smtp_properties = {
        "tls": false,
        "max_size": 0,
        "eightbitmime": false,
        "enh_status_codes": false,
    };
    
    socket.send_command = function (cmd, data) {
        if (!this.writable) {
            self.logerror("Socket writability went away");
            return self.try_deliver_host(mx);
        }
        var line = cmd + (data ? (' ' + data) : '');
        if (cmd === 'dot') {
            line = '.';
        }
        self.logprotocol("C: " + line);
        this.write(line + "\r\n");
        command = cmd.toLowerCase();
        response = [];
    };

    socket.process_ehlo_data = function () {
        for (var i=0,l=response.length; i < l; i++) {
            var r = response[i];
            if (r.toUpperCase() === '8BITMIME') {
                smtp_properties.eightbitmime = true;
            }
            else if (r.toUpperCase() === 'STARTTLS') {
                smtp_properties.tls = true;
            }
            else if (r.toUpperCase() === 'ENHANCEDSTATUSCODES') {
                smtp_properties.enh_status_codes = true;
            }
            else {
                var matches;
                matches = r.match(/^SIZE\s+(\d+)$/);
                if (matches) {
                    smtp_properties.max_size = matches[1];
                }
            }
        }

        if (smtp_properties.tls && config.get('outbound.enable_tls')) {
            this.on('secure', function () {
                socket.send_command('EHLO', config.get('me'));
            });
            this.send_command('STARTTLS');
        }
        else {
            this.send_command('MAIL', 'FROM:' + mail_from);
        }
    }
    
    socket.on('timeout', function () {
        self.logerror("Outbound connection timed out");
        processing_mail = false;
        socket.end();
        self.try_deliver_host(mx);
    });
    
    socket.on('connect', function () {
    });

    socket.on('line', function (line) {
        var matches;
        self.logprotocol("S: " + line);
        if (matches = smtp_regexp.exec(line)) {
            var code = matches[1],
                cont = matches[2],
                rest = matches[3];
            response.push(rest);
            if (cont === ' ') {
                if (code.match(/^4/)) {
                    if (/^rcpt/.test(command)) {
                        // this recipient was rejected
                        fail_recips.push(last_recip);
                    }
                    else {
                        var reason = response.join(' ');
                        socket.send_command('QUIT');
                        processing_mail = false;
                        return self.temp_fail("Upstream error: " + code + " " + reason);
                    }
                }
                else if (code.match(/^5/)) {
                    if (/^rcpt/.test(command)) {
                        bounce_recips.push(last_recip);
                    }
                    else {
                        var reason = response.join(' ');
                        socket.send_command('QUIT');
                        processing_mail = false;
                        return self.bounce(reason);
                    }
                }
                switch (command) {
                    case 'connect':
                        socket.send_command('EHLO', config.get('me'));
                        break;
                    case 'ehlo':
                        socket.process_ehlo_data();
                        break;
                    case 'starttls':
                        var key = config.get('tls_key.pem', 'data').join("\n");
                        var cert = config.get('tls_cert.pem', 'data').join("\n");
                        var tls_options = { key: key, cert: cert };

                        smtp_properties = {};
                        socket.upgrade(tls_options);
                        break;
                    case 'helo':
                        socket.send_command('MAIL', 'FROM:' + mail_from);
                        break;
                    case 'mail':
                        last_recip = recipients.shift();
                        socket.send_command('RCPT', 'TO:' + last_recip.format());
                        break;
                    case 'rcpt':
                        if (last_recip && code.match(/^250/)) ok_recips++;
                        if (!recipients.length) {
                            if (fail_recips.length) {
                                self.refcount++;
                                exports.split_to_new_recipients(self, fail_recips, "Some recipients temporarily failed", function (hmail) {
                                    self.discard();
                                    hmail.temp_fail("Some recipients temp failed: " + fail_recips.join(', '));
                                });
                            }
                            if (bounce_recips.length) {
                                self.refcount++;
                                exports.split_to_new_recipients(self, bounce_recips, "Some recipients rejected", function (hmail) {
                                    self.discard();
                                    hmail.bounce("Some recipients failed: " + bounce_recips.join(', '));
                                });
                            }
                            if (ok_recips) {
                                socket.send_command('DATA');
                            }
                            else {
                                processing_mail = false;
                                socket.send_command('QUIT');
                                self.discard();
                            }
                        }
                        else {
                            last_recip = recipients.shift();
                            socket.send_command('RCPT', 'TO:' + last_recip.format());
                        }
                        break;
                    case 'data':
                        var data_stream = self.data_stream();
                        data_stream.on('data', function (data) {
                            self.logdata("C: " + data);
                        });
                        data_stream.on('error', function (err) {
                            self.logerror("Reading from the data stream failed: " + err);
                        });
                        data_stream.on('end', function () {
                            socket.send_command('dot');
                        });
                        data_stream.pipe(socket, {end: false});
                        break;
                    case 'dot':
                        processing_mail = false;
                        var reason = response.join(' ');
                        socket.send_command('QUIT');
                        self.delivered(reason);
                        break;
                    case 'quit':
                        socket.end();
                        break;
                    default:
                        // should never get here - means we did something
                        // wrong.
                        throw new Error("Unknown command: " + command);
                }
            }
        }
        else {
            // Unrecognised response.
            self.logerror("Unrecognised response from upstream server: " + line);
            processing_mail = false;
            socket.end();
            return self.bounce("Unrecognised response from upstream server: " + line);
        }
    });
}

function populate_bounce_message (from, to, reason, hmail, cb) {
    var values = {
        date: new Date().toString(),
        me:   config.get('me'),
        from: from,
        to:   to,
        reason: reason,
        pid: process.pid,
        msgid: '<' + utils.uuid() + '@' + config.get('me') + '>',
    };
    
    var bounce_msg_ = config.get('outbound.bounce_message', 'data');
    
    var bounce_msg = bounce_msg_.map(function (item) {
        return item.replace(/\{(\w+)\}/g, function (i, word) { return values[word] || '?' }) + '\n';
    });
    
    var data_stream = hmail.data_stream();
    data_stream.on('data', function (data) {
        bounce_msg.push(data.toString());
    });
    data_stream.on('end', function () {
        cb(null, bounce_msg);
    });
    data_stream.on('error', function (err) {
        cb(err);
    })
}

HMailItem.prototype.bounce = function (err) {
    this.loginfo("bouncing mail: " + err);
    if (!this.todo) {
        // haven't finished reading the todo, delay here...
        var self = this;
        self.once('ready', function () { self._bounce(err) });
        return;
    }
    this._bounce(err);
}

HMailItem.prototype._bounce = function (err) {
    this.bounce_error = err;
    plugins.run_hooks("bounce", this, err);
}

HMailItem.prototype.bounce_respond = function (retval, msg) {
    if (retval != constants.cont) {
        this.loginfo("plugin responded with: " + retval + ". Not sending bounce.");
        if (retval === constants.stop) {
            this.discard();
        }
        delivery_concurrency--;
        return;
    }

    var self = this;
    var err  = this.bounce_error;

    delivery_concurrency--;
    if (!this.todo.mail_from.user) {
        // double bounce - mail was already a bounce
        return this.double_bounce("Mail was already a bounce");
    }
    
    var from = new Address ('<>');
    var recip = new Address (this.todo.mail_from.user, this.todo.mail_from.host);
    populate_bounce_message(from, recip, err, this, function (err, data_lines) {
        if (err) {
            return self.double_bounce("Error populating bounce message: " + err);
        }

        exports.send_email(from, recip, data_lines.join(''), function (code, msg) {
            self.discard();
            if (code === DENY) {
                // failed to even queue the mail
                return self.double_bounce("Unable to queue the bounce message. Not sending bounce!");
            }
        });
    });
}

HMailItem.prototype.double_bounce = function (err) {
    this.logerror("Double bounce: " + err);
    fs.unlink(this.path, function () {});
    // TODO: fill this in... ?
    // One strategy is perhaps log to an mbox file. What do other servers do?
    // Another strategy might be delivery "plugins" to cope with this.
}

HMailItem.prototype.delivered = function (response) {
    this.lognotice("delivered file=" + this.filename + ' response="' + response + '"');
    delivery_concurrency--;
    plugins.run_hooks("delivered", this, response);
}

HMailItem.prototype.discard = function () {
    this.refcount--;
    if (this.refcount === 0) {
        // Remove the file.
        fs.unlink(this.path, function () {});
    }
}

HMailItem.prototype.temp_fail = function (err) {
    this.num_failures++;
    delivery_concurrency--;

    // Test for max failures which is configurable.
    if (this.num_failures >= (config.get('outbound.maxTempFailures') || 13)) {
        return this.bounce("Too many failures (" + err + ")");
    }

    // basic strategy is we exponentially grow the delay to the power
    // two each time, starting at 2 ** 6 seconds
    
    // Note: More advanced options should be explored in the future as the
    // last delay is 2**17 secs (1.5 days), which is a bit long... Exim has a max delay of
    // 6 hours (configurable) and the expire time is also configurable... But
    // this is good enough for now.
    
    var delay = (Math.pow(2, (this.num_failures + 5)) * 1000);
    var until = new Date().getTime() + delay;
    
    this.loginfo("Temp failing " + this.filename + " for " + (delay/1000) + " seconds: " + err);
    
    var new_filename = this.filename.replace(/^(\d+)_(\d+)_/, until + '_' + this.num_failures + '_');
    
    var hmail = this;
    fs.rename(this.path, path.join(queue_dir, new_filename), function (err) {
        if (err) {
            return hmail.bounce("Error re-queueing email: " + err);
        }
        
        hmail.path = path.join(queue_dir, new_filename);
        hmail.filename = new_filename;

        setTimeout(function () {hmail.send()}, delay);
    });
}

// The following handler has an impact on outgoing mail. It does remove the queue file.
HMailItem.prototype.delivered_respond = function (retval, msg) {
    if (retval != constants.cont && retval != constants.ok) {
        this.logwarn("delivered plugin responded with: " + retval + " msg=" + msg + ".");
    }
    this.discard();
};
