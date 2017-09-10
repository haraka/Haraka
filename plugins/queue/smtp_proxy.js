'use strict';
// Proxy to an SMTP server
// Opens the connection to the ongoing SMTP server at MAIL FROM time
// and passes back any errors seen on the ongoing server to the
// originating server.

const smtp_client_mod = require('./smtp_client');

exports.register = function () {
    const plugin = this;

    plugin.load_smtp_proxy_ini();

    if (plugin.cfg.main.enable_outbound) {
        plugin.register_hook('queue_outbound', 'hook_queue');
    }
};

exports.load_smtp_proxy_ini = function () {
    const plugin = this;

    plugin.cfg = plugin.config.get('smtp_proxy.ini', {
        booleans: [
            '-main.enable_tls',
            '+main.enable_outbound',
        ],
    },
    function () {
        plugin.load_smtp_proxy_ini();
    });
};

exports.hook_mail = function (next, connection, params) {
    const plugin = this;
    const c = plugin.cfg.main;
    connection.loginfo(plugin, 'forwarding to ' +
            (c.forwarding_host_pool ? "configured forwarding_host_pool" : c.host + ':' + c.port)
    );
    smtp_client_mod.get_client_plugin(plugin, connection, c, function (err, smtp_client) {
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

            smtp_client.call_next(OK, smtp_client.response);
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
    const smtp_client = connection.notes.smtp_client;
    if (!smtp_client) return next();
    smtp_client.next = next;
    smtp_client.send_command('RCPT', 'TO:' + recipient.format(!smtp_client.smtp_utf8));
};

exports.hook_data = function (next, connection) {
    const smtp_client = connection.notes.smtp_client;
    if (!smtp_client) return next();
    smtp_client.next = next;
    smtp_client.send_command("DATA");
};

exports.hook_queue = function (next, connection) {
    const plugin = this;
    const smtp_client = connection.notes.smtp_client;
    if (!smtp_client) return next();
    smtp_client.next = next;
    if (smtp_client.is_dead_sender(plugin, connection)) {
        delete connection.notes.smtp_client;
        return;
    }
    smtp_client.start_data(connection.transaction.message_stream);
};

exports.hook_rset = function (next, connection) {
    const smtp_client = connection.notes.smtp_client;
    if (!smtp_client) return next();
    smtp_client.release();
    delete connection.notes.smtp_client;
    next();
};

exports.hook_quit = exports.hook_rset;

exports.hook_disconnect = function (next, connection) {
    const smtp_client = connection.notes.smtp_client;
    if (!smtp_client) return next();
    smtp_client.release();
    delete connection.notes.smtp_client;
    smtp_client.call_next();
    next();
};
