// Queue to qmail-queue

var childproc = require('child_process');
var net = require('net');
var netBinding = process.binding('net');
var fs = require('fs');
var path = require('path');

exports.register = function () {
    this.queue_exec = this.config.get('qmail-queue.path') || '/var/qmail/bin/qmail-queue';
    if (!path.existsSync(this.queue_exec)) {
        throw new Error("Cannot find qmail-queue binary (" + this.queue_exec + ")");
    }
};

exports.hook_queue = function (next, connection) {
    var plugin = this;
    // TODO: This will not work on 0.6 so we need to do something about that
    var messagePipe  = netBinding.pipe();
    var envelopePipe = netBinding.pipe();
    var qmail_queue = childproc.spawn(
        this.queue_exec, // process name
        [],              // arguments
        { customFds: [messagePipe[0], envelopePipe[0]] }
    );
    
    var finished = function (code) {
        fs.close(messagePipe[0]);
        fs.close(envelopePipe[0]);
        if (code !== 0) {
            connection.logerror(plugin, "Unable to queue message to qmail-queue: " + code);
            next();
        }
        else {
            next(OK, "Queued!");
        }
    };
    
    qmail_queue.on('exit', finished);
    
    var i = 0;
    var write_more = function () {
        if (i === connection.transaction.data_lines.length) {
            return fs.close(messagePipe[1], function () {
                // now send envelope
                // Hope this will be big enough...
                var buf = new Buffer(4096);
                var p = 0;
                buf[p++] = 70;
                var mail_from = connection.transaction.mail_from.address();
                for (var i = 0; i < mail_from.length; i++) {
                    buf[p++] = mail_from.charCodeAt(i);
                }
                buf[p++] = 0;
                connection.transaction.rcpt_to.forEach(function (rcpt) {
                    buf[p++] = 84;
                    var rcpt_to = rcpt.address();
                    for (var i = 0; i < rcpt_to.length; i++) {
                        buf[p++] = rcpt_to.charCodeAt(i);
                    }
                    buf[p++] = 0;
                });
                buf[p++] = 0;
                fs.write(envelopePipe[1], buf, 0, p, null, function () {
                    fs.close(envelopePipe[1]);
                    // now we just wait for the process to exit, which happens above
                });
            });
        }
        var buf = new Buffer(connection.transaction.data_lines[i]);
        i++;
        fs.write(messagePipe[1], buf, 0, buf.length, null, write_more);
    };
    
    write_more();
};
