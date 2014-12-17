'use strict';
// Forward to an SMTP server
// Opens the connection to the ongoing SMTP server at queue time
// and passes back any errors seen on the ongoing server to the
// originating server.

var smtp_client_mod = require('./smtp_client');

exports.register = function () {
    var plugin = this;
    var load_config = function () {
        plugin.cfg = plugin.config.get('smtp_forward.ini', {
            booleans: [
                  '-main.enable_tls',
                ],
        },
        load_config);
    };
    load_config();
};

exports.get_config = function (connection) {
    var plugin = this;

    if (!connection.transaction) return plugin.cfg.main;
    if (!connection.transaction.rcpt_to[0]) return plugin.cfg.main;
    var dom = connection.transaction.rcpt_to[0].host;

    if (!dom)             return plugin.cfg.main;
    if (!plugin.cfg[dom]) return plugin.cfg.main;  // no specific route

    var rcpt_count = connection.transaction.rcpt_to.length;
    if (rcpt_count === 1) { return plugin.cfg[dom]; }

    var dst_host = plugin.cfg[dom].host;
    for (var i=1; i < rcpt_count; i++) {
        if (connection.transaction.rcpt_to[i].host !== dst_host) {
            return plugin.cfg.main;
        }
    }
    return plugin.cfg[dom];
};

exports.hook_queue = function (next, connection) {
    var plugin = this;
    var cfg = plugin.get_config(connection);
    var txn = connection.transaction;

    connection.loginfo(plugin, 'forwarding to ' + cfg.host + ':' + cfg.port);

    var smc_cb = function (err, smtp_client) {
        smtp_client.next = next;
        var rcpt = 0;

        var send_rcpt = function () {
            if (smtp_client.is_dead_sender(plugin, connection)) {
                return;
            }
            if (rcpt === txn.rcpt_to.length) {
                smtp_client.send_command('DATA');
                return;
            }
            smtp_client.send_command('RCPT', 'TO:' + txn.rcpt_to[rcpt]);
            rcpt++;
        };

        smtp_client.on('mail', send_rcpt);
        if (cfg.one_message_per_rcpt) {
            smtp_client.on('rcpt', function () { smtp_client.send_command('DATA'); });
        }
        else {
            smtp_client.on('rcpt', send_rcpt);
        }

        smtp_client.on('data', function () {
            if (smtp_client.is_dead_sender(plugin, connection)) {
                return;
            }
            smtp_client.start_data(txn.message_stream);
        });

        smtp_client.on('dot', function () {
            if (smtp_client.is_dead_sender(plugin, connection)) {
                return;
            }
            if (rcpt < txn.rcpt_to.length) {
                smtp_client.send_command('RSET');
                return;
            }
            smtp_client.call_next(OK, smtp_client.response +
                    ' (' + connection.transaction.uuid + ')');
            smtp_client.release();
        });

        smtp_client.on('rset', function () {
            if (smtp_client.is_dead_sender(plugin, connection)) {
                return;
            }
            smtp_client.send_command('MAIL', 'FROM:' + txn.mail_from);
        });

        smtp_client.on('bad_code', function (code, msg) {
            if (smtp_client.is_dead_sender(plugin, connection)) {
                return;
            }
            smtp_client.call_next(((code && code[0] === '5') ? DENY : DENYSOFT),
                                msg + ' (' + connection.transaction.uuid + ')');
            smtp_client.release();
        });
    };

    smtp_client_mod.get_client_plugin(plugin, connection, cfg, smc_cb);
};

exports.hook_queue_outbound = exports.hook_queue;
