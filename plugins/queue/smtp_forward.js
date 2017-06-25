'use strict';
// Forward to an SMTP server
// Opens the connection to the ongoing SMTP server at queue time
// and passes back any errors seen on the ongoing server to the
// originating server.

var smtp_client_mod = require('./smtp_client');

// exported so tests can override config dir
// exports.get_net_utils = function () {
//     return require('haraka-net-utils');
// }

exports.net_utils = require('haraka-net-utils');

exports.register = function () {
    var plugin = this;
    plugin.load_errs = [];

    plugin.load_smtp_forward_ini();
    plugin.make_tls_opts();

    if (plugin.load_errs.length > 0) return;

    if (plugin.cfg.main.check_sender) {
        plugin.register_hook('mail', 'check_sender');
    }

    if (plugin.cfg.main.check_recipient) {
        plugin.register_hook('rcpt', 'check_recipient');
    }

    plugin.register_hook('queue', 'queue_forward');

    if (plugin.cfg.main.enable_outbound) {
        plugin.register_hook('queue_outbound', 'queue_forward');
    }
};

exports.make_tls_opts = function () {
    var plugin = this;
    var tls_options = {};

    if (plugin.cfg.main.enable_tls === true) {

        var tls = plugin.net_utils.load_tls_ini();
        if (!tls.outbound) { return; }

        var tlsCfg = tls.outbound;

        var config_options = [
            'ciphers', 'requestCert', 'rejectUnauthorized',
            'key', 'cert', 'honorCipherOrder', 'ecdhCurve', 'dhparam',
            'secureProtocol', 'enableOCSPStapling'
        ];

        for (let i = 0; i < config_options.length; i++) {
            let opt = config_options[i];
            if (tlsCfg[opt] === undefined) continue;

            if (opt === 'key' || opt === 'cert') {
                var pem = plugin.config.get(tlsCfg[opt], 'binary');
                if (!pem) {
                    var msg = "tls " + opt + " " + tlsCfg[opt] + " could not be loaded.";
                    this.load_errs.push(msg);
                    this.logcrit(msg + " See 'haraka -h queue/smtp_forward'");
                }

                tls_options[opt] = pem;
            }
            else {
                tls_options[opt] = tlsCfg[opt];
            }
        }
    }

    this.tls_options = tls_options;
}

exports.load_smtp_forward_ini = function () {
    var plugin = this;

    plugin.cfg = plugin.config.get('smtp_forward.ini', {
        booleans: [
            '-main.enable_tls',
            '+main.enable_outbound',
            'main.one_message_per_rcpt',
            '-main.check_sender',
            '-main.check_recipient',
            '*.enable_tls',
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

    return plugin.cfg[dom];
};

exports.check_sender = function (next, connection, params) {
    var plugin = this;
    var txn = connection.transaction;
    if (!txn) return;

    var email = params[0].address();
    if (!email) {
        txn.results.add(plugin, {skip: 'mail_from.null', emit: true});
        return next();
    }

    var domain = params[0].host.toLowerCase();
    if (!plugin.cfg[domain]) return next();

    // domain is defined in smtp_forward.ini
    txn.notes.local_sender = true;

    if (!connection.relaying) {
        txn.results.add(plugin, {fail: 'mail_from!spoof'});
        return next(DENY, "Spoofed MAIL FROM");
    }

    txn.results.add(plugin, {pass: 'mail_from'});
    return next();
};

exports.set_queue = function (connection, queue_wanted, domain) {
    var plugin = this;

    var dom_cfg = plugin.cfg[domain];
    if (dom_cfg === undefined) dom_cfg = {};

    if (!queue_wanted) queue_wanted = dom_cfg.queue || plugin.cfg.main.queue;
    if (!queue_wanted) return true;

    var dst_host = dom_cfg.host || plugin.cfg.main.host;
    if (dst_host) queue_wanted += ':' + dst_host;

    if (!connection.transaction.notes.queue) {
        connection.transaction.notes.queue = queue_wanted;
        return true;
    }

    // multiple recipients with same destination
    if (connection.transaction.notes.queue === queue_wanted) {
        return true;
    }

    // multiple recipients with different forward host, soft deny
    return false;
}

exports.check_recipient = function (next, connection, params) {
    var plugin = this;
    var txn = connection.transaction;
    if (!txn) return;

    var rcpt = params[0];
    if (!rcpt.host) {
        txn.results.add(plugin, {skip: 'rcpt!domain'});
        return next();
    }

    if (connection.relaying && txn.notes.local_sender) {
        plugin.set_queue(connection, 'outbound');
        txn.results.add(plugin, {pass: 'relaying local_sender'});
        return next(OK);
    }

    var domain = rcpt.host.toLowerCase();
    if (plugin.cfg[domain] !== undefined) {
        if (plugin.set_queue(connection, 'smtp_forward', domain)) {
            txn.results.add(plugin, {pass: 'rcpt_to'});
            return next(OK);
        }
        txn.results.add(plugin, {pass: 'rcpt_to.split'});
        return next(DENYSOFT, "Split transaction, retry soon");
    }

    // the MAIL FROM domain is not local and neither is the RCPT TO
    // Another RCPT plugin may vouch for this recipient.
    txn.results.add(plugin, {msg: 'rcpt!local'});
    return next();
};

exports.auth = function (cfg, connection, smtp_client) {
    var plugin = this;

    connection.loginfo(plugin, 'Configuring authentication for SMTP server ' + cfg.host + ':' + cfg.port);
    smtp_client.on('capabilities', function () {
        connection.loginfo(plugin, 'capabilities received');

        if ('secured' in smtp_client) {
            connection.loginfo(plugin, 'secured is pending');
            if (smtp_client.secured === false) {
                connection.loginfo(plugin, "Waiting for STARTTLS to complete. AUTH postponed");
                return;
            }
        }

        var base64 = function (str) {
            var buffer = new Buffer(str, 'UTF-8');
            return buffer.toString('base64');
        };

        if (cfg.auth_type === 'plain') {
            connection.loginfo(plugin, 'Authenticating with AUTH PLAIN ' + cfg.auth_user);
            smtp_client.send_command('AUTH', 'PLAIN ' + base64('\0' + cfg.auth_user + '\0' + cfg.auth_pass));
        }
        else if (cfg.auth_type === 'login') {
            smtp_client.authenticating = true;
            smtp_client.authenticated=false;

            connection.loginfo(plugin, 'Authenticating with AUTH LOGIN ' + cfg.auth_user);
            smtp_client.send_command('AUTH', 'LOGIN');
            smtp_client.on('auth', function () {
                //TODO: nothing?
            });
            smtp_client.on('auth_username', function () {
                smtp_client.send_command(base64(cfg.auth_user));
            });
            smtp_client.on('auth_password', function () {
                smtp_client.send_command(base64(cfg.auth_pass));
            });
        }
    });
}

exports.queue_forward = function (next, connection) {
    var plugin = this;
    var txn = connection.transaction;

    if (txn.notes.queue && !/^smtp_forward/.test(txn.notes.queue))
        return next();

    var cfg = plugin.get_config(connection);

    smtp_client_mod.get_client_plugin(plugin, connection, cfg, function (err, smtp_client) {
        smtp_client.next = next;

        var rcpt = 0;

        if (cfg.auth_user) plugin.auth(cfg, connection, smtp_client);

        connection.loginfo(plugin, 'forwarding to ' +
            (cfg.forwarding_host_pool ? "host_pool" : cfg.host + ':' + cfg.port)
        );

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
            smtp_client.send_command('RCPT', 'TO:' + txn.rcpt_to[rcpt].format(!smtp_client.smtp_utf8));
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
    });
};

exports.get_mx = function (next, hmail, domain) {
    var plugin = this;

    if (domain !== domain.toLowerCase()) domain = domain.toLowerCase();

    if (plugin.cfg[domain] === undefined) {
        plugin.logdebug('using DNS MX for: ' + domain);
        return next();
    }

    var mx_opts = [
        'auth_type', 'auth_user', 'auth_pass', 'bind', 'bind_helo',
        'using_lmtp'
    ]

    var mx = {
        priority: 0,
        exchange: plugin.cfg[domain].host || plugin.cfg.main.host,
        port: plugin.cfg[domain].port || plugin.cfg.main.port || 25,
    }

    // apply auth/mx options
    mx_opts.forEach(function (o) {
        if (plugin.cfg[domain][o] === undefined) return;
        mx[o] = plugin.cfg[domain][o];
    })

    return next(OK, mx);
};
