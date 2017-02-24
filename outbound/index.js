'use strict';

var async       = require('async');
var fs          = require('fs');
var path        = require('path');
var net         = require('net');
var util        = require('util');
var generic_pool = require('generic-pool');

var async       = require('async');
var Address     = require('address-rfc2821').Address;
var constants   = require('haraka-constants');
var generic_pool = require('generic-pool');
var net_utils   = require('haraka-net-utils');
var utils       = require('haraka-utils');
var ResultStore = require('haraka-results');

var logger      = require('../logger');
var config      = require('../config');
var trans       = require('../transaction');
var plugins     = require('../plugins');
var TimerQueue  = require('../timer_queue');
var DSN         = require('../dsn');
var FsyncWriteStream = require('../fsync_writestream');
var server      = require('../server');

var HMailItem   = require('./hmail');
var TODOItem    = require('./todo');
var cfg = require('./config');


var core_consts = require('constants');
var WRITE_EXCL  = core_consts.O_CREAT | core_consts.O_TRUNC | core_consts.O_WRONLY | core_consts.O_EXCL;

var queue_dir;
if (config.get('queue_dir')) {
    queue_dir = path.resolve(config.get('queue_dir'));
}
else if (process.env.HARAKA) {
    queue_dir = path.resolve(process.env.HARAKA, 'queue');
}
else {
    queue_dir = path.resolve('tests', 'test-queue');
}

var platformDOT = ((['win32','win64'].indexOf( process.platform ) !== -1) ? '' : '__tmp__') + '.';

exports.net_utils = net_utils;
exports.config    = config;

var load_queue = async.queue(function (file, cb) {
    var hmail = new HMailItem(file, path.join(queue_dir, file));
    exports._add_file(hmail);
    hmail.once('ready', cb);
}, cfg.concurrency_max);

var in_progress = 0;
var delivery_queue = async.queue(function (hmail, cb) {
    in_progress++;
    hmail.next_cb = function () {
        in_progress--;
        cb();
    };
    hmail.send();
}, cfg.concurrency_max);

var temp_fail_queue = new TimerQueue();

var queue_count = 0;

exports.get_stats = function () {
    return in_progress + '/' + delivery_queue.length() + '/' + temp_fail_queue.length();
};

exports.list_queue = function (cb) {
    this._load_cur_queue(null, "_list_file", cb);
};

exports.stat_queue = function (cb) {
    var self = this;
    this._load_cur_queue(null, "_stat_file", function (err) {
        if (err) return cb(err);
        return cb(null, self.stats());
    });
};

exports.scan_queue_pids = function (cb) {

    // Under cluster, this is called first by the master so
    // we create the queue directory if it doesn't exist.
    this.ensure_queue_dir();

    fs.readdir(queue_dir, function (err, files) {
        if (err) {
            logger.logerror("[outbound] Failed to load queue directory (" + queue_dir + "): " + err);
            return cb(err);
        }

        var pids = {};

        files.forEach(function (file) {
            if (/^\./.test(file)) {
                // dot-file...
                logger.logwarn("[outbound] Removing left over dot-file: " + file);
                return fs.unlink(file, function () {});
            }

            var parts = _qfile.parts(file);
            if (!parts) {
                logger.logerror("[outbound] Unrecognized file in queue directory: " + queue_dir + '/' + file);
                return;
            }

            pids[parts.pid] = true;
        });

        return cb(null, Object.keys(pids));
    });
};

process.on('message', function (msg) {
    if (msg.event && msg.event === 'outbound.load_pid_queue') {
        exports.load_pid_queue(msg.data);
        return;
    }
    if (msg.event && msg.event === 'outbound.flush_queue') {
        exports.flush_queue(msg.domain, process.pid);
        return;
    }
    if (msg.event && msg.event == 'outbound.shutdown') {
        logger.loginfo("[outbound] Shutting down temp fail queue");
        exports.drain_pools();
        temp_fail_queue.shutdown();
        return;
    }
    if (msg.event && msg.event === 'outbound.drain_pools') {
        exports.drain_pools();
        return;
    }
    // ignores the message
});

exports.drain_pools = function () {
    if (!server.notes.pool || Object.keys(server.notes.pool).length == 0) {
        return logger.logdebug("[outbound] Drain pools: No pools available");
    }
    for (var p in server.notes.pool) {
        logger.logdebug("[outbound] Drain pools: Draining SMTP connection pool " + p);
        server.notes.pool[p].drain(function () {
            if (!server.notes.pool[p]) return;
            server.notes.pool[p].destroyAllNow();
        });
    }
    logger.logdebug("[outbound] Drain pools: Pools shut down");
}

exports.flush_queue = function (domain, pid) {
    if (domain) {
        exports.list_queue(function (err, qlist) {
            if (err) return logger.logerror("Failed to load queue: " + err);
            qlist.forEach(function (todo) {
                if (todo.domain.toLowerCase() != domain.toLowerCase()) return;
                if (pid && todo.pid != pid) return;
                // console.log("requeue: ", todo);
                delivery_queue.push(new HMailItem(todo.file, todo.full_path));
            });
        })
    }
    else {
        temp_fail_queue.drain();
    }
};

exports.load_pid_queue = function (pid) {
    logger.loginfo("[outbound] Loading queue for pid: " + pid);
    this.load_queue(pid);
};

exports.ensure_queue_dir = function () {
    // No reason not to do this stuff syncronously -
    // this code is only run at start-up.
    if (fs.existsSync(queue_dir)) return;

    logger.logdebug("[outbound] Creating queue directory " + queue_dir);
    try {
        fs.mkdirSync(queue_dir, 493); // 493 == 0755
    }
    catch (err) {
        if (err.code !== 'EEXIST') {
            logger.logerror("Error creating queue directory: " + err);
            throw err;
        }
    }
};

exports.load_queue = function (pid) {
    // Initialise and load queue
    // This function is called first when not running under cluster,
    // so we create the queue directory if it doesn't already exist.
    this.ensure_queue_dir();
    this._load_cur_queue(pid, "_add_file");
};

exports._load_cur_queue = function (pid, cb_name, cb) {
    var self = this;
    logger.loginfo("[outbound] Loading outbound queue from ", queue_dir);
    fs.readdir(queue_dir, function (err, files) {
        if (err) {
            return logger.logerror("Failed to load queue directory (" +
                queue_dir + "): " + err);
        }

        self.cur_time = new Date(); // set once so we're not calling it a lot

        self.load_queue_files(pid, cb_name, files, cb);
    });
};

exports.load_queue_files = function (pid, cb_name, files, callback) {
    var self = this;
    if (files.length === 0) return;

    if (cfg.disabled && cb_name === '_add_file') {
        // try again in 1 second if delivery is disabled
        setTimeout(function () {
            exports.load_queue_files(pid, cb_name, files, callback);
        }, 1000);
        return;
    }

    if (pid) {
        // Pre-scan to rename PID files to my PID:
        logger.loginfo("[outbound] Grabbing queue files for pid: " + pid);
        async.eachLimit(files, 200, function (file, cb) {

            var parts = _qfile.parts(file);
            if (parts && parts.pid === parseInt(pid)) {
                var next_process = parts.next_attempt;
                // maintain some original details for the rename
                var new_filename = _qfile.name({
                    arrival      : parts.arrival,
                    uid          : parts.uid,
                    next_attempt : parts.next_attempt,
                    attempts     : parts.attempts,
                });
                // logger.loginfo("new_filename: ", new_filename);
                fs.rename(path.join(queue_dir, file), path.join(queue_dir, new_filename), function (err) {
                    if (err) {
                        logger.logerror("Unable to rename queue file: " + file +
                            " to " + new_filename + " : " + err);
                        return cb();
                    }
                    if (next_process <= self.cur_time) {
                        load_queue.push(new_filename);
                    }
                    else {
                        temp_fail_queue.add(next_process - self.cur_time, function () {
                            load_queue.push(new_filename);
                        });
                    }
                    cb();
                });
            }
            else if (/^\./.test(file)) {
                // dot-file...
                logger.logwarn("Removing left over dot-file: " + file);
                return fs.unlink(path.join(queue_dir, file), function (err) {
                    if (err) {
                        logger.logerror("Error removing dot-file: " + file + ": " + err);
                    }
                    cb();
                });
            }
            else {
                // Do this because otherwise we blow the stack
                async.setImmediate(cb);
            }
        }, function (err) {
            if (err) {
                // no error cases yet, but log anyway
                logger.logerror("Error fixing up queue files: " + err);
            }
            logger.loginfo("Done fixing up old PID queue files");
            logger.loginfo(delivery_queue.length() + " files in my delivery queue");
            logger.loginfo(load_queue.length() + " files in my load queue");
            logger.loginfo(temp_fail_queue.length() + " files in my temp fail queue");

            if (callback) callback();
        });
    }
    else {
        logger.loginfo("Loading the queue...");
        var good_file = function (file) {
            if (/^\./.test(file)) {
                logger.logwarn("Removing left over dot-file: " + file);
                fs.unlink(path.join(queue_dir, file), function (err) {
                    if (err) console.error(err);
                });
                return false;
            }

            if (!_qfile.parts(file)) {
                logger.logerror("Unrecognized file in queue folder: " + file);
                return false;
            }
            return true;
        }
        async.mapSeries(files.filter(good_file), function (file, cb) {
            // logger.logdebug("Loading queue file: " + file);
            if (cb_name === '_add_file') {
                var parts = _qfile.parts(file);
                var next_process = parts.next_attempt;

                if (next_process <= self.cur_time) {
                    logger.logdebug("File needs processing now");
                    load_queue.push(file);
                }
                else {
                    logger.logdebug("File needs processing later: " + (next_process - self.cur_time) + "ms");
                    temp_fail_queue.add(next_process - self.cur_time, function () { load_queue.push(file);});
                }
                cb();
            }
            else {
                self[cb_name](file, cb);
            }
        }, callback);
    }
};

exports._add_file = function (hmail) {
    if (hmail.next_process < this.cur_time) {
        delivery_queue.push(hmail);
    }
    else {
        temp_fail_queue.add(hmail.next_process - this.cur_time, function () {
            delivery_queue.push(hmail);
        });
    }
};

exports._list_file = function (file, cb) {
    var tl_reader = fs.createReadStream(path.join(queue_dir, file), {start: 0, end: 3});
    tl_reader.on('error', function (err) {
        console.error("Error reading queue file: " + file + ":", err);
    });
    tl_reader.once('data', function (buf) {
        // I'm making the assumption here we won't ever read less than 4 bytes
        // as no filesystem on the planet should be that dumb...
        tl_reader.destroy();
        var todo_len = (buf[0] << 24) + (buf[1] << 16) + (buf[2] << 8) + buf[3];
        var td_reader = fs.createReadStream(path.join(queue_dir, file), {encoding: 'utf8', start: 4, end: todo_len + 3});
        var todo = '';
        td_reader.on('data', function (str) {
            todo += str;
            if (Buffer.byteLength(todo) === todo_len) {
                // we read everything
                var todo_struct = JSON.parse(todo);
                todo_struct.rcpt_to = todo_struct.rcpt_to.map(function (a) { return new Address (a); });
                todo_struct.mail_from = new Address (todo_struct.mail_from);
                todo_struct.file = file;
                todo_struct.full_path = path.join(queue_dir, file);
                var parts = _qfile.parts(file);
                todo_struct.pid = (parts && parts.pid) || null;
                cb(null, todo_struct);
            }
        });
        td_reader.on('end', function () {
            if (Buffer.byteLength(todo) !== todo_len) {
                console.error("Didn't find right amount of data in todo for file:", file);
                return cb();
            }
        });
    });
};

exports._stat_file = function (file, cb) {
    queue_count++;
    cb();
};

exports.stats = function () {
    // TODO: output more data here
    var results = {
        queue_dir:   queue_dir,
        queue_count: queue_count,
    };

    return results;
};


var _qfile = exports.qfile = require('./qfile');

exports.send_email = function () {

    if (arguments.length === 2) {
        logger.loginfo("[outbound] Sending email as a transaction");
        return this.send_trans_email(arguments[0], arguments[1]);
    }

    var from = arguments[0];
    var to   = arguments[1];
    var contents = arguments[2];
    var next = arguments[3];
    var options = arguments[4];

    var dot_stuffed = ((options && options.dot_stuffed) ? options.dot_stuffed : false);
    var notes = ((options && options.notes) ? options.notes : null);

    logger.loginfo("[outbound] Sending email via params");

    var transaction = trans.createTransaction();

    logger.loginfo("[outbound] Created transaction: " + transaction.uuid);

    //Adding notes passed as parameter
    if (notes) {
        transaction.notes = notes;
    }

    // set MAIL FROM address, and parse if it's not an Address object
    if (from instanceof Address) {
        transaction.mail_from = from;
    }
    else {
        try {
            from = new Address(from);
        }
        catch (err) {
            return next(constants.deny, "Malformed from: " + err);
        }
        transaction.mail_from = from;
    }

    // Make sure to is an array
    if (!(Array.isArray(to))) {
        // turn into an array
        to = [ to ];
    }

    if (to.length === 0) {
        return next(constants.deny, "No recipients for email");
    }

    // Set RCPT TO's, and parse each if it's not an Address object.
    for (var i=0,l=to.length; i < l; i++) {
        if (!(to[i] instanceof Address)) {
            try {
                to[i] = new Address(to[i]);
            }
            catch (err) {
                return next(constants.deny,
                    "Malformed to address (" + to[i] + "): " + err);
            }
        }
    }

    transaction.rcpt_to = to;

    // Set data_lines to lines in contents
    if (typeof contents == 'string') {
        var match;
        while ((match = utils.line_regexp.exec(contents))) {
            var line = match[1];
            line = line.replace(/\r?\n?$/, '\r\n'); // make sure it ends in \r\n
            if (dot_stuffed === false && line.length >= 3 && line.substr(0,1) === '.') {
                line = "." + line;
            }
            transaction.add_data(new Buffer(line));
            contents = contents.substr(match[1].length);
            if (contents.length === 0) {
                break;
            }
        }
    }
    else {
        // Assume a stream
        return stream_line_reader(contents, transaction, function (err) {
            if (err) {
                return next(constants.denysoft, "Error from stream line reader: " + err);
            }
            exports.send_trans_email(transaction, next);
        });
    }

    transaction.message_stream.add_line_end();
    this.send_trans_email(transaction, next);
};

function stream_line_reader (stream, transaction, cb) {
    var current_data = '';
    function process_data (data) {
        current_data += data.toString();
        var results;
        while ((results = utils.line_regexp.exec(current_data))) {
            var this_line = results[1];
            current_data = current_data.slice(this_line.length);
            if (!(current_data.length || this_line.length)) {
                return;
            }
            transaction.add_data(new Buffer(this_line));
        }
    }

    function process_end () {
        if (current_data.length) {
            transaction.add_data(new Buffer(current_data));
        }
        current_data = '';
        transaction.message_stream.add_line_end();
        cb();
    }

    stream.on('data', process_data);
    stream.once('end', process_end);
    stream.once('error', cb);
}

exports.send_trans_email = function (transaction, next) {
    var self = this;

    // add in potentially missing headers
    if (!transaction.header.get_all('Message-Id').length) {
        logger.loginfo("[outbound] Adding missing Message-Id header");
        transaction.add_header('Message-Id', '<' + transaction.uuid + '@' + config.get('me') + '>');
    }
    if (!transaction.header.get_all('Date').length) {
        logger.loginfo("[outbound] Adding missing Date header");
        transaction.add_header('Date', utils.date_to_str(new Date()));
    }

    transaction.add_leading_header('Received', '('+cfg.received_header+'); ' + utils.date_to_str(new Date()));

    var connection = {
        transaction: transaction,
    };

    logger.add_log_methods(connection);
    transaction.results = transaction.results || new ResultStore(connection);

    connection.pre_send_trans_email_respond = function (retval) {
        var deliveries = [];
        var always_split = cfg.always_split;
        if (always_split) {
            this.logdebug({name: "outbound"}, "always split");
            transaction.rcpt_to.forEach(function (rcpt) {
                deliveries.push({domain: rcpt.host, rcpts: [ rcpt ]});
            });
        }
        else {
            // First get each domain
            var recips = {};
            transaction.rcpt_to.forEach(function (rcpt) {
                var domain = rcpt.host;
                if (!recips[domain]) { recips[domain] = []; }
                recips[domain].push(rcpt);
            });
            Object.keys(recips).forEach(function (domain) {
                deliveries.push({'domain': domain, 'rcpts': recips[domain]});
            });
        }

        var hmails = [];
        var ok_paths = [];

        var todo_index = 1;

        async.forEachSeries(deliveries, function (deliv, cb) {
            var todo = new TODOItem(deliv.domain, deliv.rcpts, transaction);
            todo.uuid = todo.uuid + '.' + todo_index;
            todo_index++;
            self.process_delivery(ok_paths, todo, hmails, cb);
        },
        function (err) {
            if (err) {
                for (var i=0,l=ok_paths.length; i<l; i++) {
                    fs.unlink(ok_paths[i], function () {});
                }
                if (next) next(constants.denysoft, err);
                return;
            }

            for (var j=0; j<hmails.length; j++) {
                var hmail = hmails[j];
                delivery_queue.push(hmail);
            }

            if (next) {
                next(constants.ok, "Message Queued");
            }
        });
    }

    plugins.run_hooks('pre_send_trans_email', connection);
};

exports.process_delivery = function (ok_paths, todo, hmails, cb) {
    var self = this;
    logger.loginfo("[outbound] Processing domain: " + todo.domain);
    var fname = _qfile.name();
    var tmp_path = path.join(queue_dir, platformDOT + fname);
    var ws = new FsyncWriteStream(tmp_path, { flags: WRITE_EXCL });
    ws.on('close', function () {
        var dest_path = path.join(queue_dir, fname);
        fs.rename(tmp_path, dest_path, function (err) {
            if (err) {
                logger.logerror("[outbound] Unable to rename tmp file!: " + err);
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
        logger.logerror("[outbound] Unable to write queue file (" + fname + "): " + err);
        ws.destroy();
        fs.unlink(tmp_path, function () {});
        cb("Queueing failed");
    });
    self.build_todo(todo, ws, function () {
        todo.message_stream.pipe(ws, { line_endings: '\r\n', dot_stuffing: true, ending_dot: false });
    });
};

exports.build_todo = function (todo, ws, write_more) {
    // Replacer function to exclude items from the queue file header
    function exclude_from_json (key, value) {
        switch (key) {
            case 'message_stream':
                return undefined;
            default:
                return value;
        }
    }
    var todo_str = new Buffer(JSON.stringify(todo, exclude_from_json));

    // since JS has no pack() we have to manually write the bytes of a long
    var todo_length = new Buffer(4);
    var todo_l = todo_str.length;
    todo_length[3] =  todo_l        & 0xff;
    todo_length[2] = (todo_l >>  8) & 0xff;
    todo_length[1] = (todo_l >> 16) & 0xff;
    todo_length[0] = (todo_l >> 24) & 0xff;

    var buf = Buffer.concat([todo_length, todo_str], todo_str.length + 4);

    var continue_writing = ws.write(buf);
    if (continue_writing) return write_more();
    ws.once('drain', write_more);
};


exports.split_to_new_recipients = function (hmail, recipients, response, cb) {
    var self = this;
    if (recipients.length === hmail.todo.rcpt_to.length) {
        // Split to new for no reason - increase refcount and return self
        hmail.refcount++;
        return cb(hmail);
    }
    var fname = _qfile.name();
    var tmp_path = path.join(queue_dir, platformDOT + fname);
    var ws = new FsyncWriteStream(tmp_path, { flags: WRITE_EXCL });
    var err_handler = function (err, location) {
        logger.logerror("[outbound] Error while splitting to new recipients (" + location + "): " + err);
        hmail.todo.rcpt_to.forEach(function (rcpt) {
            hmail.extend_rcpt_with_dsn(rcpt, DSN.sys_unspecified("Error splitting to new recipients: " + err));
        });
        hmail.bounce("Error splitting to new recipients: " + err);
    };

    ws.on('error', function (err) { err_handler(err, "tmp file writer");});

    var writing = false;

    var write_more = function () {
        if (writing) return;
        writing = true;
        var rs = hmail.data_stream();
        rs.pipe(ws, {end: false});
        rs.on('error', function (err) {
            err_handler(err, "hmail.data_stream reader");
        });
        rs.on('end', function () {
            ws.on('close', function () {
                var dest_path = path.join(queue_dir, fname);
                fs.rename(tmp_path, dest_path, function (err) {
                    if (err) {
                        err_handler(err, "tmp file rename");
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
    };

    ws.on('error', function (err) {
        logger.logerror("[outbound] Unable to write queue file (" + fname + "): " + err);
        ws.destroy();
        hmail.todo.rcpt_to.forEach(function (rcpt) {
            hmail.extend_rcpt_with_dsn(rcpt, DSN.sys_unspecified("Error re-queueing some recipients: " + err));
        });
        hmail.bounce("Error re-queueing some recipients: " + err);
    });

    var new_todo = JSON.parse(JSON.stringify(hmail.todo));
    new_todo.rcpt_to = recipients;
    self.build_todo(new_todo, ws, write_more);
};

exports.get_tls_options = function (mx) {

    var tls_options = exports.net_utils.tls_ini_section_with_defaults('outbound');
    tls_options.servername = mx.exchange;

    if (tls_options.key) {
        if (Array.isArray(tls_options.key)) {
            tls_options.key = tls_options.key[0];
        }
        tls_options.key = exports.config.get(tls_options.key, 'binary');
    }

    if (tls_options.dhparam) {
        tls_options.dhparam = exports.config.get(tls_options.dhparam, 'binary');
    }

    if (tls_options.cert) {
        if (Array.isArray(tls_options.cert)) {
            tls_options.cert = tls_options.cert[0];
        }
        tls_options.cert = exports.config.get(tls_options.cert, 'binary');
    }

    return tls_options;
};

// exported for testability
exports.TODOItem = TODOItem;


exports.HMailItem = HMailItem;

exports.lookup_mx = require('./mx_lookup').lookup_mx;
