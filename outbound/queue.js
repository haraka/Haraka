"use strict";

var async       = require('async');
var path        = require('path');
var fs          = require('fs');
var Address     = require('address-rfc2821').Address;

var config      = require('../config');
var logger      = require('../logger');

var TimerQueue  = require('./timer_queue');
var HMailItem   = require('./hmail');
var cfg         = require('./config');
var _qfile      = require('./qfile');

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

exports.queue_dir = queue_dir;

var load_queue = async.queue(function (file, cb) {
    var hmail = new HMailItem(file, path.join(queue_dir, file));
    exports._add_file(hmail);
    hmail.once('ready', cb);
}, cfg.concurrency_max);

var in_progress = 0;
var delivery_queue = exports.delivery_queue = async.queue(function (hmail, cb) {
    in_progress++;
    hmail.next_cb = function () {
        in_progress--;
        cb();
    };
    hmail.send();
}, cfg.concurrency_max);

var temp_fail_queue = exports.temp_fail_queue = new TimerQueue();

var queue_count = 0;

exports.get_stats = function () {
    return in_progress + '/' + exports.delivery_queue.length() + '/' + exports.temp_fail_queue.length();
};

exports.list_queue = function (cb) {
    exports._load_cur_queue(null, "_list_file", cb);
};

exports._stat_file = function (file, cb) {
    queue_count++;
    setImmediate(cb);
};

exports.stat_queue = function (cb) {
    var self = exports;
    exports._load_cur_queue(null, "_stat_file", function (err) {
        if (err) return cb(err);
        return cb(null, self.stats());
    });
};

exports.load_queue = function (pid) {
    // Initialise and load queue
    // This function is called first when not running under cluster,
    // so we create the queue directory if it doesn't already exist.
    exports.ensure_queue_dir();
    exports._load_cur_queue(pid, "_add_file");
};

exports._load_cur_queue = function (pid, cb_name, cb) {
    var self = exports;
    logger.loginfo("[outbound] Loading outbound queue from ", queue_dir);
    fs.readdir(queue_dir, function (err, files) {
        if (err) {
            return logger.logerror("[outbound] Failed to load queue directory (" +
                queue_dir + "): " + err);
        }

        self.cur_time = new Date(); // set once so we're not calling it a lot

        self.load_queue_files(pid, cb_name, files, cb);
    });
};

exports.load_queue_files = function (pid, cb_name, files, callback) {
    var self = exports;
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
                        logger.logerror("[outbound] Unable to rename queue file: " + file +
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
                logger.logwarn("[outbound] Removing left over dot-file: " + file);
                return fs.unlink(path.join(queue_dir, file), function (err) {
                    if (err) {
                        logger.logerror("[outbound] Error removing dot-file: " + file + ": " + err);
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
                logger.logerror("[outbound] Error fixing up queue files: " + err);
            }
            logger.loginfo("[outbound] Done fixing up old PID queue files");
            logger.loginfo("[outbound] " + delivery_queue.length() + " files in my delivery queue");
            logger.loginfo("[outbound] " + load_queue.length() + " files in my load queue");
            logger.loginfo("[outbound] " + temp_fail_queue.length() + " files in my temp fail queue");

            if (callback) callback();
        });
    }
    else {
        logger.loginfo("[outbound] Loading the queue...");
        var good_file = function (file) {
            if (/^\./.test(file)) {
                logger.logwarn("[outbound] Removing left over dot-file: " + file);
                fs.unlink(path.join(queue_dir, file), function (err) {
                    if (err) console.error(err);
                });
                return false;
            }

            if (!_qfile.parts(file)) {
                logger.logerror("[outbound] Unrecognized file in queue folder: " + file);
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
                    logger.logdebug("[outbound] File needs processing now");
                    load_queue.push(file);
                }
                else {
                    logger.logdebug("[outbound] File needs processing later: " + (next_process - self.cur_time) + "ms");
                    temp_fail_queue.add(next_process - self.cur_time, function () { load_queue.push(file);});
                }
                async.setImmediate(cb);
            }
            else {
                self[cb_name](file, cb);
            }
        }, callback);
    }
};

exports.stats = function () {
    // TODO: output more data here
    var results = {
        queue_dir:   queue_dir,
        queue_count: queue_count,
    };

    return results;
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

exports.flush_queue = function (domain, pid) {
    if (domain) {
        exports.list_queue(function (err, qlist) {
            if (err) return logger.logerror("[outbound] Failed to load queue: " + err);
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
    exports.load_queue(pid);
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
            logger.logerror("[outbound] Error creating queue directory: " + err);
            throw err;
        }
    }
};

exports._add_file = function (hmail) {
    if (hmail.next_process < exports.cur_time) {
        delivery_queue.push(hmail);
    }
    else {
        temp_fail_queue.add(hmail.next_process - exports.cur_time, function () {
            delivery_queue.push(hmail);
        });
    }
};

exports.scan_queue_pids = function (cb) {
    // Under cluster, this is called first by the master so
    // we create the queue directory if it doesn't exist.
    exports.ensure_queue_dir();

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
