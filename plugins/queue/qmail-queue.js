// Queue to qmail-queue

var childproc = require('child_process');
var net = require('net');
var netBinding = process.binding('net');
var fs = require('fs');

exports.register = function () {
    this.queue_exec = this.config.get('qmail-queue.path') || '/var/qmail/bin/qmail-queue';
};

exports.hook_queue = function (callback, connection) {
    var plugin = this;
    var messagePipe  = netBinding.pipe();
    var envelopePipe = netBinding.pipe();
    var qmail_queue = childproc.spawn(
        this.queue_exec, // process name
        [],              // arguments
        { customFds: [messagePipe[0], envelopePipe[0]] }
    );
    
    qmail_queue.on('exit', function (code) {
        if (code !== 0) {
            plugin.logerror("Unable to queue message to qmail-queue: " + code);
            callback(CONT);
        }
        else {
            callback(OK, "Queued!");
        }
    });
    
    var i = 0;
    var write_more = function () {
        if (i === connection.transaction.data_lines.length) {
            fs.close(messagePipe[1], function () {
                // now send envelope
                var envelope = 'F' + connection.transaction.mail_from.replace(/</, '').replace(/>/, '');
                envelope += '\0';
                connection.transaction.rcpt_to.forEach(function (rcpt) {
                    envelope += 'T' + rcpt.replace(/</, '').replace(/>/, '') + '\0';
                });
                envelope += '\0';
                fs.write(envelopePipe[1], buf, 0, buf.length, null, function () {
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
