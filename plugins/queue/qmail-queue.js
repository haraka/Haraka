// Queue to qmail-queue

var childproc = require('child_process');
var existsSync = require('./utils').existsSync;

exports.register = function () {
    this.queue_exec = this.config.get('qmail-queue.path') || '/var/qmail/bin/qmail-queue';
    if (!existsSync(this.queue_exec)) {
        throw new Error("Cannot find qmail-queue binary (" + this.queue_exec + ")");
    }
};

exports.hook_queue = function (next, connection) {
    var plugin = this;
    var qmail_queue = childproc.spawn(
        this.queue_exec, // process name
        [],              // arguments
        { stdio: ['pipe', 'pipe', process.stderr] }
    );
    
    var finished = function (code) {
        if (code !== 0) {
            connection.logerror(plugin, "Unable to queue message to qmail-queue: " + code);
            next();
        }
        else {
            next(OK, "Queued!");
        }
    };
    
    qmail_queue.on('exit', finished);
    
    connection.transaction.message_stream.pipe(qmail_queue.stdin);

    qmail_queue.stdin.on('close', function () {
        if (!connection.transaction) {
            plugin.logerror("Transaction went away while delivering mail to qmail-queue");
            qmail_queue.stdout.end();
        }
        plugin.loginfo("Message Stream sent to qmail. Now sending envelope");
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
        qmail_queue.stdout.on('error', function (err) {}); // stdout throws an error on close
        qmail_queue.stdout.end(buf);
    });
};
