// Proxy to an SMTP server
// Opens the connection to the ongoing SMTP server at MAIL FROM time
// and passes back any errors seen on the ongoing server to the
// originating server.

var smtp_client_mod = require('./smtp_client');

exports.hook_mail = function (next, connection, params) {
    var config = this.config.get('smtp_proxy.ini');
    connection.loginfo(this, "proxying to " + config.main.host + ":" + config.main.port);
    var self = this;
    smtp_client_mod.get_client_plugin(this, connection, config, function (err, smtp_client) {
        connection.notes.smtp_client = smtp_client;
        smtp_client.next = next;

        smtp_client.on('mail', smtp_client.call_next);
        smtp_client.on('rcpt', smtp_client.call_next);
        smtp_client.on('data', smtp_client.call_next);

        smtp_client.on('dot', function () {
            delete connection.notes.smtp_client;
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
    smtp_client.next = next;
    smtp_client.start_data(connection.transaction.data_lines);
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
