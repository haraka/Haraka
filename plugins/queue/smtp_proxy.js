// Proxy to an SMTP server
// Opens the connection to the ongoing SMTP server at MAIL FROM time
// and passes back any errors seen on the ongoing server to the
// originating server.

var smtp_client_module = require('./plugins/queue/conn_pool_base');

exports.hook_mail = function (next, connection, params) {
    var config = this.config.get('smtp_proxy.ini');
    connection.loginfo(this, "proxying to " + config.main.host + ":" + config.main.port);
    var self = this;
    smtp_client_module.get_client(connection.server, config, function (err, smtp_client) {
        connection.notes.smtp_client = smtp_client;
        smtp_client.next = next;
        smtp_client.call_next = function (retval, msg) {
            if (this.next) {
                this.next(retval, msg);
                delete this.next;
            }
        };

        smtp_client.on('client_protocol', function (line) {
            connection.logprotocol('C: ' + line);
        });

        smtp_client.on('server_protocol', function (line) {
            connection.logprotocol('S: ' + line);
        });

        var helo = function (command) {
            if (smtp_client.xclient) {
                smtp_client.send_command(command, connection.hello_host);
            }
            else {
                smtp_client.send_command(command, self.config.get('me'));
            }
        };

        smtp_client.on('greeting', helo);
        smtp_client.on('xclient', helo);

        smtp_client.send_xclient = function () {
            smtp_client.send_command('XCLIENT', 'ADDR=' + connection.remote_ip);
        };

        smtp_client.on('helo', function () {
            smtp_client.send_command('MAIL', 'FROM:' + connection.transaction.mail_from);
        });

        smtp_client.on('mail', smtp_client.call_next);
        smtp_client.on('rcpt', smtp_client.call_next);
        smtp_client.on('data', smtp_client.call_next);

        smtp_client.on('dot', function () {
            smtp_client.call_next(OK, smtp_client.response + ' (' + connection.transaction.uuid + ')');
            smtp_client.release();
            delete connection.notes.smtp_client;
        });

        smtp_client.on('error', function (msg) {
            connection.logerror(msg);
            smtp_client.call_next();
        });

        smtp_client.on('bad_code', function (code, msg) {
            if (smtp_client.command !== 'rcpt') {
                // errors are OK for rcpt, but nothing else
                // this can also happen if the destination server
                // times out, but that is okay.
                connection.loginfo(self, "message denied, proxying failed");
                smtp_client.release();
                delete connection.notes.smtp_client;
            }

            smtp_client.call_next(code.match(/^4/) ? DENYSOFT : DENY,
                smtp_client.response.slice());
        });

        smtp_client.start();
    });
};

exports.hook_rcpt_ok = function (next, connection, recipient) {
    var smtp_client = connection.notes.smtp_client;
    if (!smtp_client) return next();
    smtp_client.next = next;
    smtp_client.send_command('RCPT', 'TO:' + recipient);
};

exports.hook_data = function (next, connection) {
    var smtp_client = connection.notes.smtp_client;
    if (!smtp_client) return next();
    smtp_client.next = next;
    smtp_client.send_command("DATA");
};

exports.hook_queue = function (next, connection) {
    var smtp_client = connection.notes.smtp_client;
    if (!smtp_client) return next();
    smtp_client.command = 'mailbody';
    smtp_client.next = next;
    smtp_client.data = connection.transaction.data_lines;
    smtp_client.send_data();
};

exports.hook_rset = function (next, connection) {
    var smtp_client = connection.notes.smtp_client;
    if (!smtp_client) return next();
    smtp_client.release();
    delete connection.notes.smtp_client;
    next();
}

exports.hook_quit = exports.hook_rset;

exports.hook_disconnect = function (next, connection) {
    var smtp_client = connection.notes.smtp_client;
    if (!smtp_client) return next();
    smtp_client.release();
    delete connection.notes.smtp_client;
    smtp_client.call_next();
    next();
};
