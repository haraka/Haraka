'use strict';
// Forward to an SMTP server
// Opens the connection to the ongoing SMTP server at queue time
// and passes back any errors seen on the ongoing server to the
// originating server.

const url = require('url');

const smtp_client_mod = require('./smtp_client');

exports.register = function () {
    const plugin = this;
    plugin.load_errs = [];

    plugin.load_smtp_forward_ini();

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

exports.load_smtp_forward_ini = function () {
    const plugin = this;

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
    const plugin = this;

    if (!connection.transaction) return plugin.cfg.main;
    if (!connection.transaction.rcpt_to[0]) return plugin.cfg.main;
    const dom = connection.transaction.rcpt_to[0].host;

    if (!dom)             return plugin.cfg.main;
    if (!plugin.cfg[dom]) return plugin.cfg.main;  // no specific route

    return plugin.cfg[dom];
};

exports.check_sender = function (next, connection, params) {
    const plugin = this;
    const txn = connection.transaction;
    if (!txn) return;

    const email = params[0].address();
    if (!email) {
        txn.results.add(plugin, {skip: 'mail_from.null', emit: true});
        return next();
    }

    const domain = params[0].host.toLowerCase();
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
    const plugin = this;

    let dom_cfg = plugin.cfg[domain];
    if (dom_cfg === undefined) dom_cfg = {};

    if (!queue_wanted) queue_wanted = dom_cfg.queue || plugin.cfg.main.queue;
    if (!queue_wanted) return true;

    let dst_host = dom_cfg.host || plugin.cfg.main.host;
    if (dst_host) dst_host = `smtp://${dst_host}`;

    const notes = connection.transaction.notes;
    if (!notes.get('queue.wants')) {
        notes.set('queue.wants', queue_wanted);
        if (dst_host) {
            notes.set('queue.next_hop', dst_host);
        }
        return true;
    }

    // multiple recipients with same destination
    if (notes.get('queue.wants') === queue_wanted) {
        if (!dst_host) return true;
        const next_hop = notes.get('queue.next_hop');
        if (!next_hop) return true;
        if (next_hop === dst_host) return true;
    }

    // multiple recipients with different forward host, soft deny
    return false;
}

exports.check_recipient = function (next, connection, params) {
    const plugin = this;
    const txn = connection.transaction;
    if (!txn) return;

    const rcpt = params[0];
    if (!rcpt.host) {
        txn.results.add(plugin, {skip: 'rcpt!domain'});
        return next();
    }

    if (connection.relaying && txn.notes.local_sender) {
        plugin.set_queue(connection, 'outbound');
        txn.results.add(plugin, {pass: 'relaying local_sender'});
        return next(OK);
    }

    const domain = rcpt.host.toLowerCase();
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
    const plugin = this;

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

        const base64 = function (str) {
            const buffer = new Buffer(str, 'UTF-8');
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
    const plugin = this;
    const txn = connection.transaction;

    const q_wants = txn.notes.get('queue.wants');
    if (q_wants && q_wants !== 'smtp_forward') {
        connection.logdebug(plugin, `skipping, unwanted (${q_wants})`);
        return next();
    }

    const cfg = plugin.get_config(connection);

    smtp_client_mod.get_client_plugin(plugin, connection, cfg, function (err, smtp_client) {
        smtp_client.next = next;

        let rcpt = 0;

        if (cfg.auth_user) plugin.auth(cfg, connection, smtp_client);

        connection.loginfo(plugin, 'forwarding to ' +
            (cfg.forwarding_host_pool ? "host_pool" : cfg.host + ':' + cfg.port)
        );

        function get_rs () {
            if (connection.transaction) return connection.transaction.results;
            return connection.results;
        }

        const dead_sender = function () {
            if (smtp_client.is_dead_sender(plugin, connection)) {
                get_rs().add(plugin, { err: 'dead sender' });
                return true;
            }
            return false;
        }

        const send_rcpt = function () {
            if (dead_sender()) return;
            if (rcpt === txn.rcpt_to.length) {
                smtp_client.send_command('DATA');
                return;
            }
            smtp_client.send_command('RCPT', 'TO:' + txn.rcpt_to[rcpt].format(!smtp_client.smtp_utf8));
            rcpt++;
        }

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
            get_rs().add(plugin, { pass: smtp_client.response });
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

exports.get_mx_next_hop = function (next_hop) {
    const dest = url.parse(next_hop);
    const mx = {
        priority: 0,
        port: dest.port || 25,
        exchange: dest.hostname,
    }
    if (dest.auth) {
        mx.auth_type = 'plain';
        mx.auth_user = dest.auth.split(':')[0];
        mx.auth_pass = dest.auth.split(':')[1];
    }
    return mx;
}

exports.get_mx = function (next, hmail, domain) {
    const plugin = this;

    // hmail.todo not defined in tests.
    if (hmail.todo.notes.next_hop) {
        return next(OK, plugin.get_mx_next_hop(hmail.todo.notes.next_hop));
    }

    if (domain !== domain.toLowerCase()) domain = domain.toLowerCase();

    if (plugin.cfg[domain] === undefined) {
        plugin.logdebug('using DNS MX for: ' + domain);
        return next();
    }

    const mx_opts = [
        'auth_type', 'auth_user', 'auth_pass', 'bind', 'bind_helo',
        'using_lmtp'
    ]

    const mx = {
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
