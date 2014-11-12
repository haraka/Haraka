'use strict';
// Proxy to an SMTP server
// Opens the connection to the ongoing SMTP server at MAIL FROM time
// and passes back any errors seen on the ongoing server to the
// originating server.

var smtp_client_mod = require('./smtp_client');

exports.register = function () {
    var plugin = this;
    var load_config = function () {
        plugin.cfg = plugin.config.get('smtp_proxy.ini', {
            booleans: [
                  '-main.enable_tls',
                ],
        },
        load_config);
    };
    load_config();
};

exports.hook_mail = function (next, connection, params) {
    var plugin = this;
    var c = plugin.cfg.main;
    connection.loginfo(this, "proxying to " + c.host + ":" + c.port);
    smtp_client_mod.get_client_plugin(plugin, connection, plugin.cfg, function (err, smtp_client) {
        connection.notes.smtp_client = smtp_client;
        smtp_client.next = next;

        smtp_client.on('mail', smtp_client.call_next);
        smtp_client.on('rcpt', smtp_client.call_next);
        smtp_client.on('data', smtp_client.call_next);

        smtp_client.on('dot', function () {
            if (smtp_client.is_dead_sender(plugin, connection)) {
                delete connection.notes.smtp_client;
                return;
            }

            smtp_client.call_next(OK, smtp_client.response + ' (' + connection.transaction.uuid + ')');
            smtp_client.release();
            delete connection.notes.smtp_client;
        });

        smtp_client.on('error', function () {
            delete connection.notes.smtp_client;
        });

        smtp_client.on('bad_code', function (code, msg) {
            smtp_client.call_next(code.match(/^4/) ? DENYSOFT : DENY,
                smtp_client.response.slice());

            if (smtp_client.command !== 'rcpt') {
                // errors are OK for rcpt, but nothing else
                // this can also happen if the destination server
                // times out, but that is okay.
                connection.loginfo(plugin, "message denied, proxying failed");
                smtp_client.release();
                delete connection.notes.smtp_client;
            }
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
    var plugin = this;
    var smtp_client = connection.notes.smtp_client;
    if (!smtp_client) return next();
    smtp_client.next = next;
    if (smtp_client.is_dead_sender(plugin, connection)) {
        delete connection.notes.smtp_client;
        return;
    }
    smtp_client.start_data(connection.transaction.message_stream);
};

exports.hook_rset = function (next, connection) {
    var smtp_client = connection.notes.smtp_client;
    if (!smtp_client) return next();
    smtp_client.release();
    delete connection.notes.smtp_client;
    next();
};

exports.hook_quit = exports.hook_rset;

exports.hook_disconnect = function (next, connection) {
    var smtp_client = connection.notes.smtp_client;
    if (!smtp_client) return next();
    smtp_client.release();
    delete connection.notes.smtp_client;
    smtp_client.call_next();
    next();
};
