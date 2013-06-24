// Forward to an SMTP server
// Opens the connection to the ongoing SMTP server at queue time
// and passes back any errors seen on the ongoing server to the
// originating server.

var smtp_client_mod = require('./smtp_client');

exports.hook_queue = function (next, connection) {
    var plugin = this;
    var config = this.config.get('smtp_forward.ini');
    connection.loginfo(this, "forwarding to " + config.main.host + ":" + config.main.port);
    smtp_client_mod.get_client_plugin(this, connection, config, function (err, smtp_client) {
        smtp_client.next = next;
        var rcpt = 0;
        var send_rcpt = function () {
            if (_is_dead_sender(plugin, connection, smtp_client)) {
                return;
            }
            else if (rcpt < connection.transaction.rcpt_to.length) {
                smtp_client.send_command('RCPT',
                    'TO:' + connection.transaction.rcpt_to[rcpt]);
                rcpt++;
            }
            else {
                smtp_client.send_command('DATA');
            }
        };
        smtp_client.on('mail', send_rcpt);
        if (config.main.one_message_per_rcpt) {
            smtp_client.on('rcpt', function () { smtp_client.send_command('DATA'); });
        }
        else {
            smtp_client.on('rcpt', send_rcpt);
        }

        smtp_client.on('data', function () {
            if (_is_dead_sender(plugin, connection, smtp_client)) {
                return;
            }
            smtp_client.start_data(connection.transaction.message_stream);
        });

        smtp_client.on('dot', function () {
            if (_is_dead_sender(plugin, connection, smtp_client)) {
                return;
            }
            else if (rcpt < connection.transaction.rcpt_to.length) {
                smtp_client.send_command('RSET');
            }
            else {
                smtp_client.call_next(OK, smtp_client.response + ' (' + connection.transaction.uuid + ')');
                smtp_client.release();
            }
        });

        smtp_client.on('rset', function () {
            if (_is_dead_sender(plugin, connection, smtp_client)) {
                return;
            }
            smtp_client.send_command('MAIL',
                'FROM:' + connection.transaction.mail_from);
        });

        smtp_client.on('bad_code', function (code, msg) {
            if (_is_dead_sender(plugin, connection, smtp_client)) {
                return;
            }
            smtp_client.call_next(((code && code[0] === '5') ? DENY : DENYSOFT), 
                                  msg + ' (' + connection.transaction.uuid + ')');
            smtp_client.release();
        });
    });
};

function _is_dead_sender(plugin, connection, smtp_client) {
    if (!connection.transaction) {
        // This likely means the sender went away on us, cleanup.
        connection.logwarn(
          plugin,"transaction went away, releasing smtp_client"
        );
        smtp_client.release();
        return true;
    }

    return false;
}

exports.hook_queue_outbound = exports.hook_queue;
