'use strict';
// Forward to an SMTP server
// Opens the connection to the ongoing SMTP server at queue time
// and passes back any errors seen on the ongoing server to the
// originating server.

var smtp_client_mod = require('./smtp_client');

exports.register = function () {
    var plugin = this;

    plugin.load_smtp_forward_ini();

    if (plugin.cfg.main.enable_outbound) {
        plugin.register_hook('queue_outbound', 'hook_queue');
    }
};

exports.load_smtp_forward_ini = function () {
    var plugin = this;

    plugin.cfg = plugin.config.get('smtp_forward.ini', {
        booleans: [
            '-main.enable_tls',
            '+main.enable_outbound',
        ],
    },
    function () {
        plugin.load_smtp_forward_ini();
    });
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

    connection.loginfo(plugin, 'forwarding to ' +
            (cfg.forwarding_host_pool ? "configured forwarding_host_pool" : cfg.host + ':' + cfg.port)
        );

    var smc_cb = function (err, smtp_client) {
        smtp_client.next = next;

        if (cfg.auth_user) {
            connection.loginfo(plugin, 'Configuring authentication for SMTP server ' + cfg.host + ':' + cfg.port);
            smtp_client.on('capabilities', function() {

                var base64 = function(str) {
                    var buffer = new Buffer(str, 'UTF-8');
                    return buffer.toString('base64');
                };

                if (cfg.auth_type === 'plain') {
                    connection.loginfo(plugin, 'Authenticating with AUTH PLAIN ' + cfg.auth_user);
                    smtp_client.send_command('AUTH', 'PLAIN ' + base64('\0' + cfg.auth_user + '\0' + cfg.auth_pass));
                }
                else if (cfg.auth_type === 'login') {
                    smtp_client.send_command('AUTH', 'LOGIN');
                    smtp_client.on('auth', function() {
                        connection.loginfo(plugin, 'Authenticating with AUTH LOGIN ' + cfg.auth_user);
                    });
                    smtp_client.on('auth_username', function() {
                        smtp_client.send_command(base64(cfg.auth_user) + '\r\n');
                    });
                    smtp_client.on('auth_password', function() {
                        smtp_client.send_command(base64(cfg.auth_pass) + '\r\n');
                    });
                }
            });
        }

        var rcpt = 0;

        var dead_sender = function () {
            if (smtp_client.is_dead_sender(plugin, connection)) {
                var rs = connection.transaction ?
                         connection.transaction.results :
                         connection.results;
                rs.add(plugin, { err: 'dead sender' });
                return true;
            }
            return false;
        };

        var send_rcpt = function () {
            if (dead_sender()) return;
            if (rcpt === txn.rcpt_to.length) {
                smtp_client.send_command('DATA');
                return;
            }
            smtp_client.send_command('RCPT', 'TO:' + txn.rcpt_to[rcpt]);
            rcpt++;
        };

        smtp_client.on('mail', send_rcpt);
        if (cfg.one_message_per_rcpt) {
            smtp_client.on('rcpt', function () {
                smtp_client.send_command('DATA');
            });
        }
        else {
            smtp_client.on('rcpt', send_rcpt);
        }

        smtp_client.on('data', function () {
            if (dead_sender()) return;
            smtp_client.start_data(txn.message_stream);
        });

        smtp_client.on('dot', function () {
            if (dead_sender()) return;
            if (rcpt < txn.rcpt_to.length) {
                smtp_client.send_command('RSET');
                return;
            }
            smtp_client.call_next(OK, smtp_client.response);
            smtp_client.release();
        });

        smtp_client.on('rset', function () {
            if (dead_sender()) return;
            smtp_client.send_command('MAIL', 'FROM:' + txn.mail_from);
        });

        smtp_client.on('bad_code', function (code, msg) {
            if (dead_sender()) return;
            smtp_client.call_next(((code && code[0] === '5') ? DENY : DENYSOFT),
                                msg);
            smtp_client.release();
        });
    };

    smtp_client_mod.get_client_plugin(plugin, connection, cfg, smc_cb);
};

