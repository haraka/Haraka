// Proxy to an SMTP server
// Opens the connection to the ongoing SMTP server at MAIL FROM time
// and passes back any errors seen on the ongoing server to the
// originating server.

var smtp_regexp = /^([0-9]{3})([ -])(.*)/;

exports.register = function () {
    this.inherits('queue/conn_pool_base');
}

exports.hook_mail = function (next, connection, params) {
    var config = this.config.get('smtp_proxy.ini');
    connection.loginfo(this, "proxying to " + config.main.host + ":" + config.main.port);
    var smtp_conn = this.smtp_conn_get(connection, config.main.host, config.main.port, config.main.timeout, config.main.enable_tls);
    smtp_conn.next = next;

    var self = this;

    smtp_conn.on_error = function (code) {
        var response_array = smtp_conn.response.slice();
        if (smtp_conn.command !== 'rcpt') {
            // errors are OK for rcpt, but nothing else
            // this can also happen if the destination server
            // times out, but that is okay.
            connection.loginfo(self, "message denied, proxying failed");
            smtp_conn.reset();
        }

        smtp_conn.call_next(code.match(/^4/) ? DENYSOFT : DENY, response_array);
        return false;
    };

    smtp_conn.on_mail = smtp_conn.on_rcpt = smtp_conn.on_data = function () {
        smtp_conn.call_next();
    }

    smtp_conn.start();
};

exports.hook_rcpt_ok = function (next, connection, recipient) {
    var smtp_conn = connection.notes.conn;
    smtp_conn.next = next;
    smtp_conn.send_command('RCPT', 'TO:' + recipient);
};

exports.hook_data = function (next, connection) {
    var smtp_conn = connection.notes.conn;
    smtp_conn.next = next;
    smtp_conn.send_command("DATA");
};

exports.hook_queue = function (next, connection) {
    var smtp_conn = connection.notes.conn;
    smtp_conn.command = 'mailbody';
    smtp_conn.next = next;
    smtp_conn.send_data();
};

exports.hook_rset = function (next, connection) {
    var smtp_conn = connection.notes.conn;
    smtp_conn.reset();
    next();
}

exports.hook_quit = exports.hook_rset;

exports.hook_disconnect = function (next, connection) {
    var smtp_conn = connection.notes.conn;
    smtp_conn.reset();
    smtp_conn.call_next();
    next();
};
