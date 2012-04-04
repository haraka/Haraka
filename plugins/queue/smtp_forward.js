// Forward to an SMTP server
// Opens the connection to the ongoing SMTP server at queue time
// and passes back any errors seen on the ongoing server to the
// originating server.

var smtp_regexp = /^([0-9]{3})([ -])(.*)/;

exports.register = function () {
    this.inherits('queue/conn_pool_base');
};

exports.hook_queue = function (next, connection) {
    var config = this.config.get('smtp_forward.ini');
    connection.loginfo(this, "forwarding to " + config.main.host + ":" + config.main.port);
    var smtp_conn = this.smtp_conn_get(connection, config.main.host, config.main.port, config.main.timeout, config.main.enable_tls);
    smtp_conn.next = next;
    var recipients = connection.transaction.rcpt_to.map(function(item) { return item });

    smtp_conn.on_error = function (code) {
        if (!(smtp_conn.command === 'mail' || smtp_conn.command === 'rcpt')) {
            // NOTE: recipients can be sent at both 'mail' *AND* 'rcpt'
            // command states if multiple recipients are present.
            // We ignore errors for both states as the DATA command will
            // be rejected by the remote end if there are no recipients.
            smtp_conn.reset();
            smtp_conn.call_next(); // Fall through to other queue hooks here
            return false;
        }
        return true;
    };

    smtp_conn.on_mail = function () {
        smtp_conn.send_command('RCPT', 'TO:' + recipients.shift());
        if (recipients.length) {
            // don't move to next state if we have more recipients
            smtp_conn.command = 'mail';
            return;
        }
    };

    smtp_conn.on_rcpt = function () {
        smtp_conn.send_command('DATA');
    };

    smtp_conn.on_data = function () {
        smtp_conn.command = 'mailbody';
        smtp_conn.send_data();
    };

    smtp_conn.start();
};
