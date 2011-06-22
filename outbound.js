var fs = require('fs');
var path = require('path');
var dns = require('dns');
var util = require("util");
var events = require("events");
var utils = require('./utils');
var sock = require('./line_socket');
var server = require('./server');
var logger = require('./logger');
var config  = require('./config');
var constants = require('./constants');

var Address = require('./address').Address;

var delivery_concurrency = 0;

var DENY = constants.deny;
var OK   = constants.ok;

var MAX_UNIQ = 10000;
var host = require('os').hostname().replace(/\\/, '\\057').replace(/:/, '\\072');
var fn_re = /^(\d+)_(\d+)_/; // I like how this looks like a person

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
    }
}

exports.init = function () {
    this.queue_dir = path.resolve(config.get('queue_dir') || (process.env.HARAKA + '/queue'));

    this.uniq = Math.round(Math.random() * MAX_UNIQ);

    this.max_concurrency = config.get('outbound_concurrency_max') || 100;

    this.load_queue();
}

function HMailItem (filename, path) {
    events.EventEmitter.call(this);
    var matches = filename.match(fn_re);
    if (!matches) {
        throw new Error("Bad filename: " + filename);
    }
    this.path     = path;
    this.filename = filename;
    this.next_process = matches[1];
    this.num_failures = matches[2];
    
    this.size_file();
}

util.inherits(HMailItem, events.EventEmitter);

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

exports.load_queue = function () {
    // Initialise and load queue. If we're running under cluster, only do this in the master process
    if (!server.cluster || server.cluster.isMaster) {
        // no reason not to do this stuff syncronously - we're just loading here
        if (!path.existsSync(this.queue_dir)) {
            this.logdebug("Creating queue directory " + this.queue_dir);
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
}

exports._next_uniq = function () {
    var result = this.uniq++;
    if (this.uniq >= MAX_UNIQ) {
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

exports.send_email = function (transaction, next) {
    var self = this;
    
    // add in potentially missing headers
    if (!transaction.header.get_all('Message-Id').length) {
        transaction.add_header('Message-Id', '<' + transaction.uuid + '@' + config.get('me') + '>');
    }
    if (!transaction.header.get_all('Date').length) {
        transaction.add_header('Date', new Date().toString());
    }
    
    // First get each domain
    var recips = {};
    transaction.rcpt_to.forEach(function (item) {
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
                setTimeout(function (h) {
                    return function () {
                        self.internal_send_email(h)
                    }
                }(hmail), 0);
            }
            next(code, msg);
        }
        else {
            ok_paths.push(path);
        }
        num_domains--;
    }
    
    for (var dom in recips) {
        var from = transaction.mail_from;
        var data_lines = transaction.data_lines;
        this.process_domain(dom, recips[dom], from, data_lines, hmails, mynext);
    }
}

exports.process_domain = function (dom, recips, from, data_lines, hmails, cb) {
    var plugin = this;
    var fname = this._fname();
    var tmp_path = path.join(this.queue_dir, '.' + fname);
    var ws = fs.createWriteStream(tmp_path);
    var data_pos = 0;
    var write_more = function () {
        if (data_pos === data_lines.length) {
            ws.on('close', function () {
                var dest_path = path.join(plugin.queue_dir, fname);
                fs.rename(tmp_path, dest_path, function (err) {
                    if (err) {
                        plugin.logerror("Unable to rename tmp file!: " + err);
                        cb(tmp_path, DENY, "Queue error");
                    }
                    else {
                        hmails.push(new HMailItem (fname, dest_path));
                        cb(tmp_path, OK, "Queued!");
                    }
                });
            });
            ws.destroySoon();
            return;
        }
        
        // write, but fixup "." at the beginning of the line to be ".."
        // and fixup \n to be \r\n
        if (ws.write(data_lines[data_pos++].replace(/^\./m, '..').replace(/\r?\n/g, "\r\n"))) {
            write_more();
        }
    };

    ws.on('error', function (err) {
        plugin.logerror("Unable to write queue file (" + fname + "): " + err);
        ws.destroy();
        cb(tmp_path, DENY, "Queueing failed");
    });

    ws.on('drain', write_more);

    plugin.build_todo(dom, recips, from, ws, write_more);
}

exports.build_todo = function (dom, recips, from, ws, write_more) {
    var todo_str = JSON.stringify(
        {
            domain: dom,
            mail_from: from,
            rcpt_to:   recips,
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

exports.split_to_new_recipients = function (hmail, recipients) {
    var plugin = this;
    var fname = this._fname();
    var tmp_path = path.join(this.queue_dir, '.' + fname);
    var ws = fs.createWriteStream(tmp_path);

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
            // rs.destroy();
            plugin.delivered(hmail);
            ws.on('close', function () {
                var dest_path = path.join(plugin.queue_dir, fname);
                fs.rename(tmp_path, dest_path, function (err) {
                    if (err) {
                        plugin.logerror("Unable to rename tmp file!: " + err);
                        plugin.bounce("Error re-queuing some recipients", hmail);
                    }
                    else {
                        var split_mail = new HMailItem (fname, dest_path);
                        split_mail.on('ready', function () {
                            plugin.temp_fail("Split into multiple recipients", split_mail);
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
        plugin.bounce("Error re-queueing some recipients", hmail);
    });

    ws.on('drain', write_more);

    plugin.build_todo(hmail.todo.domain, recipients, hmail.todo.mail_from, ws, write_more);
}

exports._load_cur_queue = function (cb_name) {
    var plugin = this;
    plugin.loginfo("Loading outbound queue from ", plugin.queue_dir);
    fs.readdir(plugin.queue_dir, function (err, files) {
        if (err) {
            return plugin.logerror("Failed to load queue directory (" + plugin.queue_dir + "): " + err);
        }
        
        plugin.cur_time = new Date(); // set this once so we're not calling it a lot

        plugin.load_queue_files(cb_name, files);
    });
}

exports.load_queue_files = function (cb_name, files) {
    var plugin = this;
    if (files.length === 0) return;

    this.loginfo("Loading some of the queue...");

    if ((delivery_concurrency >= this.max_concurrency)
        || config.get('outbound.disabled'))
    {
        // try again in 1 second if delivery is disabled
        setTimeout(function () {plugin.load_queue_files(cb_name, files)}, 1000);
        return;
    }

    for (var i=1; i <= this.max_concurrency; i++) {
        if (files.length === 0) break;
        var file = files.shift();
        if (/^\./.test(file)) {
            // dot-file...
            continue;
        }
        var hmail = new HMailItem(file, path.join(this.queue_dir, file));
        this[cb_name](hmail);

        if ((files.length === 0) || (i === this.max_concurrency)) {
            // end of loop or end of files
            var self = this;
            hmail.on('ready', function () {self.load_queue_files(cb_name, files)});
            break;
        }
    }
}

exports._add_file = function (hmail) {
    var self = this;
    this.loginfo("Adding file: " + hmail.filename);
    setTimeout(function () { self.internal_send_email(hmail) }, hmail.next_process - this.cur_time);
}

exports.internal_send_email = function (hmail) {
    if (!hmail.todo) {
        var self = this;
        hmail.on('ready', function () { self._send_email(hmail) });
    }
    else {
        this._send_email(hmail);
    }
}

var util = require('util');

exports._send_email = function (hmail) {
    var plugin = this;

    if ((delivery_concurrency >= this.max_concurrency)
        || config.get('outbound.disabled'))
    {
        // try again in 1 second if delivery is disabled
        plugin.logdebug("delivery disabled temporarily");
        setTimeout(function () {plugin._send_email(hmail)}, 1000);
        return;
    }

    this.logdebug("Sending mail: " + hmail.filename);

    // plugin.loginfo("Hmail: " + util.inspect(hmail, null, null));
    
    // FOR TESTING!
    // hmail.mxlist = [{priority: 0, exchange: '127.0.0.1'}];
    // return plugin.try_deliver(hmail);

    get_mx(hmail.todo.domain, function (err, mxs) {
        if (err) {
            plugin.logerror("MX Lookup for " + hmail.todo.domain + " failed: " + err);
            if (err.code === dns.NXDOMAIN || err.code === 'ENOTFOUND') {
                plugin.bounce("No Such Domain: " + hmail.todo.domain, hmail);
            }
            else if (err.code === 'NOMX') {
                plugin.bounce("Nowhere to deliver mail to for domain: " + hmail.todo.domain, hmail);
            }
            else {
                // every other error is transient
                plugin.temp_fail("DNS lookup failure: " + err, hmail);
            }
        }
        else {
            // got MXs
            var mxlist = sort_mx(mxs);
            hmail.mxlist = mxlist;
            plugin.try_deliver(hmail);
        }
    });
}

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

var smtp_regexp = /^([0-9]{3})([ -])(.*)/;

exports.try_deliver = function (hmail) {
    var self = this;
    delivery_concurrency++;

    // check if there are any MXs left
    if (hmail.mxlist.length === 0) {
        return this.temp_fail("Tried all MXs", hmail);
    }
    
    var host = hmail.mxlist.shift().exchange;
    
    dns.resolve(host, function (err, addresses) {
        if (err) {
            self.logerror("DNS lookup of " + host + " failed: " + err);
            delivery_concurrency--;
            return self.try_deliver(hmail);
        }
        if (addresses.length === 0) {
            // NODATA or empty host list
            self.logerror("DNS lookup of " + host + " resulted in no data");
            delivery_concurrency--;
            return self.try_deliver(hmail);
        }
        hmail.hostlist = addresses;
        self.try_deliver_host(hmail);
    });
}

exports.try_deliver_host = function (hmail) {
    var self = this;
    
    if (hmail.hostlist.length === 0) {
        delivery_concurrency--;
        return this.try_deliver(hmail);
    }
    
    var host = hmail.hostlist.shift();
    
    self.loginfo("Attempting to deliver to: " + host + " (" + delivery_concurrency + ")");
    
    var socket = new sock.Socket();
    socket.connect(25, host);
    socket.setTimeout(300 * 1000);
    var command = 'connect';
    var response = [];
    // this.loginfo(hmail.todo.rcpt_to);
    var recipients = hmail.todo.rcpt_to.map(function (a) { return new Address (a.original) });
    // this.loginfo(recipients);
    var mail_from  = new Address (hmail.todo.mail_from.original);
    var data_marker = 0;
    var last_recip;
    var ok_recips = 0;
    var fail_recips = [];
    
    socket.send_command = function (cmd, data) {
        var line = cmd + (data ? (' ' + data) : '');
        if (cmd === 'dot') {
            line = '.';
        }
        self.logprotocol("C: " + line);
        this.write(line + "\r\n");
        command = cmd.toLowerCase();
    };
    
    socket.on('timeout', function () {
        self.logerror("Outbound connection timed out");
        socket.end();
        self.try_deliver_host(hmail);
    });
    
    socket.on('error', function (err) {
        self.logerror("Ongoing connection failed: " + err);
        // try the next MX
        self.try_deliver_host(hmail);
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
                        if (!(ok_recips || recipients.length)) {
                            // no accepted recipients, and no more left so bail out
                            socket.send_command('QUIT');
                            return self.temp_fail("Upstream error: " + code + " " + rest, hmail);
                        }
                    }
                    else {
                        socket.send_command('QUIT');
                        return self.temp_fail("Upstream error: " + code + " " + rest, hmail);
                    }
                }
                else if (code.match(/^5/)) {
                    socket.send_command('QUIT');
                    return self.bounce(rest, hmail);
                }
                switch (command) {
                    case 'connect':
                        socket.send_command('HELO', config.get('me'));
                        break;
                    case 'helo':
                        socket.send_command('MAIL', 'FROM:' + mail_from);
                        break;
                    case 'mail':
                    case 'rcpt_':
                        if (command === 'rcpt_') ok_recips++;
                        last_recip = recipients.shift();
                        socket.send_command('RCPT', 'TO:' + last_recip.format());
                        if (recipients.length) {
                            // don't move to next state if we have more recipients
                            command = 'rcpt_';
                        }
                        break;
                    case 'rcpt':
                        socket.send_command('DATA');
                        break;
                    case 'data':
                        var data_stream = hmail.data_stream();
                        data_stream.pipe(socket, {end: false});
                        data_stream.on('error', function (err) {
                            self.logerror("Reading from the data stream failed: " + err);
                        });
                        data_stream.on('data', function (data) {
                            self.logprotocol("C: " + data);
                        });
                        data_stream.on('end', function () {
                            socket.send_command('dot');
                        });
                        break;
                    case 'dot':
                        socket.send_command('QUIT');
                        if (fail_recips.length) {
                            self.split_to_new_recipients(hmail, fail_recips);
                        }
                        else {
                            self.delivered(hmail);
                        }
                        break;
                    case 'quit':
                        socket.end();
                        break;
                    default:
                        throw new Error("Unknown command: " + command);
                }
            }
        }
        else {
            // Unrecognised response.
            self.logerror("Unrecognised response from upstream server: " + line);
            socket.end();
            return self.bounce("Unrecognised response from upstream server: " + line, hmail);
        }
    });
}

var default_bounce_template = ['Received: (Haraka {pid} invoked for bounce); {date}\n',
'Date: {date}\n',
'From: MAILER-DAEMON@{me}\n',
'To: {from}\n',
'Subject: failure notice\n',
'Message-Id: {msgid}\n',
'\n',
'Hi. This is the Haraka Mailer program at {me}.\n',
'I\'m afraid I wasn\'t able to deliver your message to the following addresses.\n',
'This is a permanent error; I\'ve given up. Sorry it didn\'t work out.\n',
'\n',
'{to}: {reason}\n',
'\n',
'--- Below this line is a copy of the message.\n',
'\n'];

exports.populate_bounce_message = function (from, to, reason, hmail, cb) {
    var values = {
        date: new Date().toString(),
        me:   config.get('me'),
        from: from,
        to:   to,
        reason: reason,
        pid: process.pid,
        msgid: '<' + utils.uuid() + '@' + config.get('me') + '>',
    };
    
    var bounce_msg_ = config.get('outbound.bounce_message', 'list');
    if (bounce_msg_.length === 0) {
        bounce_msg_ = default_bounce_template;
    }
    
    var bounce_msg = bounce_msg_.map(function (item) {
        return item.replace(/\{(\w+)\}/g, function (i, word) { return values[word] || '?' });
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

exports.bounce = function (err, hmail) {
    this.loginfo("bouncing mail: " + err);
    if (!hmail.todo) {
        // haven't finished reading the todo, delay here...
        var self = this;
        hmail.on('ready', function () { self._bounce(err, hmail) });
        return;
    }
    
    this._bounce(err, hmail);
}

exports._bounce = function (err, hmail) {
    var self = this;
    delivery_concurrency--;
    if (! hmail.todo.mail_from.user) {
        // double bounce - mail was already a bounce
        return this.double_bounce("Mail was already a bounce", hmail);
    }
    
    var from = new Address ('<>');
    var recip = new Address (hmail.todo.mail_from.user, hmail.todo.mail_from.host);
    var dom = recip.host;
    this.populate_bounce_message(from, recip, err, hmail, function (err, data_lines) {
        if (err) {
            return self.double_bounce("Error populating bounce message: " + err);
        }

        var hmails = [];

        self.process_domain(dom, [recip], from, data_lines, hmails,
            function (path, code, msg) {
                fs.unlink(hmail.path);
                if (code === DENY) {
                    // failed to even queue the mail
                    return self.double_bounce("Unable to queue the bounce message. Not sending bounce!", hmail);
                }
                setTimeout(function () {self.internal_send_email(hmails[0])}, 0);
            }
        );
    });
}

exports.double_bounce = function (err, hmail) {
    this.logerror("Double bounce: " + err);
    fs.unlink(hmail.path);
    // TODO: fill this in... ?
    // One strategy is perhaps log to an mbox file. What do other servers do?
    // Another strategy might be delivery "plugins" to cope with this.
}

exports.delivered = function (hmail) {
    this.loginfo("Successfully delivered mail: " + hmail.filename);
    delivery_concurrency--;
    fs.unlink(hmail.path);
}

exports.temp_fail = function (err, hmail) {
    var plugin = this;
    hmail.num_failures++;
    delivery_concurrency--;
    
    if (hmail.num_failures >= 13) {
        return this.bounce("Too many failures (" + err + ")", hmail);
    }

    // basic strategy is we exponentially grow the delay to the power
    // two each time, starting at 2 ** 6 seconds
    
    // Note: More advanced options should be explored in the future as the
    // last delay is 2**17 secs (1.5 days), which is a bit long... Exim has a max delay of
    // 6 hours (configurable) and the expire time is also configurable... But
    // this is good enough for now.
    
    var delay = (Math.pow(2, (hmail.num_failures + 5)) * 1000);
    var until = new Date().getTime() + delay;
    
    this.loginfo("Temp failing " + hmail.filename + " for " + (delay/1000) + " seconds: " + err);
    
    var new_filename = hmail.filename.replace(/^(\d+)_(\d+)_/, until + '_' + hmail.num_failures + '_');
    
    fs.rename(hmail.path, path.join(this.queue_dir, new_filename), function (err) {
        if (err) {
            return plugin.bounce("Error re-queueing email: " + err, hmail);
        }
        
        hmail.path = path.join(plugin.queue_dir, new_filename);
        hmail.filename = new_filename;

        setTimeout(function () {plugin.internal_send_email(hmail)}, delay);
    });
}
