'use strict';

var async       = require('async');
var fs          = require('fs');
var path        = require('path');

var Address     = require('address-rfc2821').Address;
var constants   = require('haraka-constants');
var net_utils   = require('haraka-net-utils');
var utils       = require('haraka-utils');
var ResultStore = require('haraka-results');

var logger      = require('../logger');
var config      = require('../config');
var trans       = require('../transaction');
var plugins     = require('../plugins');
var DSN         = require('../dsn');
var FsyncWriteStream = require('./fsync_writestream');
var server      = require('../server');

var cfg         = require('./config');
var queuelib    = require('./queue');
var HMailItem   = require('./hmail');
var TODOItem    = require('./todo');
var pools       = require('./client_pool');
var _qfile      = require('./qfile');

var queue_dir = queuelib.queue_dir;
var temp_fail_queue = queuelib.temp_fail_queue;
var delivery_queue = queuelib.delivery_queue;

exports.net_utils = net_utils;
exports.config    = config;

exports.get_stats = queuelib.get_stats;
exports.list_queue = queuelib.list_queue;
exports.stat_queue = queuelib.stat_queue;
exports.scan_queue_pids = queuelib.scan_queue_pids;
exports.flush_queue = queuelib.flush_queue;
exports.load_pid_queue = queuelib.load_pid_queue;
exports.ensure_queue_dir = queuelib.ensure_queue_dir;
exports.load_queue = queuelib.load_queue;
exports._add_file = queuelib._add_file;
exports.stats = queuelib.stats;
exports.drain_pools = pools.drain_pools;

var _qfile = exports.qfile = require('./qfile');

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
            logger.logdebug({name: "outbound"}, "always split");
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
    var tmp_path = path.join(queue_dir, _qfile.platformDOT + fname);
    var ws = new FsyncWriteStream(tmp_path, { flags: constants.WRITE_EXCL });
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

// exported for testability
exports.TODOItem = TODOItem;

exports.HMailItem = HMailItem;

exports.lookup_mx = require('./mx_lookup').lookup_mx;
