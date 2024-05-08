'use strict';
// Forward to an SMTP server
// Opens the connection to the ongoing SMTP server at queue time
// and passes back any errors seen on the ongoing server to the
// originating server.

const url = require('node:url');

const smtp_client_mod = require('./smtp_client');

exports.register = function () {
    this.load_errs = [];

    this.load_smtp_forward_ini();

    if (this.load_errs.length > 0) return;

    if (this.cfg.main.check_sender) {
        this.register_hook('mail', 'check_sender');
    }

    if (this.cfg.main.check_recipient) {
        this.register_hook('rcpt', 'check_recipient');
    }

    this.register_hook('queue', 'queue_forward');

    if (this.cfg.main.enable_outbound) {
        // deliver local message via smtp forward when relaying=true
        this.register_hook('queue_outbound', 'queue_forward');
    }

    // may specify more specific [per-domain] outbound routes
    this.register_hook('get_mx', 'get_mx');
}

exports.load_smtp_forward_ini = function () {

    this.cfg = this.config.get('smtp_forward.ini', {
        booleans: [
            '-main.enable_tls',
            '-main.enable_outbound',
            'main.one_message_per_rcpt',
            '-main.check_sender',
            '-main.check_recipient',
            '*.enable_tls',
            '*.enable_outbound'
        ],
    },
    () => {
        this.load_smtp_forward_ini();
    });
}

exports.get_config = function (conn) {

    if (!conn.transaction) return this.cfg.main;

    let dom;
    if (this.cfg.main.domain_selector === 'mail_from') {
        if (!conn.transaction.mail_from) return this.cfg.main;
        dom = conn.transaction.mail_from.host;
    }
    else {
        if (!conn.transaction.rcpt_to[0]) return this.cfg.main;
        dom = conn.transaction.rcpt_to[0].host;
    }

    if (!dom)             return this.cfg.main;
    if (!this.cfg[dom]) return this.cfg.main;  // no specific route

    return this.cfg[dom];
}

exports.is_outbound_enabled = function (dom_cfg) {

    if ('enable_outbound' in dom_cfg) return dom_cfg.enable_outbound; // per-domain flag

    return this.cfg.main.enable_outbound; // follow the global configuration
}

exports.check_sender = function (next, connection, params) {
    const txn = connection?.transaction;
    if (!txn) return;

    const email = params[0].address();
    if (!email) {
        txn.results.add(this, {skip: 'mail_from.null', emit: true});
        return next();
    }

    const domain = params[0].host.toLowerCase();
    if (!this.cfg[domain]) return next();

    // domain is defined in smtp_forward.ini
    txn.notes.local_sender = true;

    if (!connection.relaying) {
        txn.results.add(this, {fail: 'mail_from!spoof'});
        return next(DENY, "Spoofed MAIL FROM");
    }

    txn.results.add(this, {pass: 'mail_from'});
    next();
}

exports.set_queue = function (connection, queue_wanted, domain) {

    let dom_cfg = this.cfg[domain];
    if (dom_cfg === undefined) dom_cfg = {};

    if (!queue_wanted) queue_wanted = dom_cfg.queue || this.cfg.main.queue;
    if (!queue_wanted) return true;

    let dst_host = dom_cfg.host || this.cfg.main.host;
    if (dst_host) dst_host = `smtp://${dst_host}`;

    const notes = connection?.transaction?.notes;
    if (!notes) return false;
    if (!notes.get('queue.wants')) {
        notes.set('queue.wants', queue_wanted);
        if (dst_host) notes.set('queue.next_hop', dst_host);
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
    const txn = connection?.transaction;
    if (!txn) return;

    const rcpt = params[0];
    if (!rcpt.host) {
        txn.results.add(this, {skip: 'rcpt!domain'});
        return next();
    }

    if (connection.relaying && txn.notes.local_sender) {
        this.set_queue(connection, 'outbound');
        txn.results.add(this, {pass: 'relaying local_sender'});
        return next(OK);
    }

    const domain = rcpt.host.toLowerCase();
    if (this.cfg[domain] !== undefined) {
        if (this.set_queue(connection, 'smtp_forward', domain)) {
            txn.results.add(this, {pass: 'rcpt_to'});
            return next(OK);
        }
        txn.results.add(this, {pass: 'rcpt_to.split'});
        return next(DENYSOFT, "Split transaction, retry soon");
    }

    // the MAIL FROM domain is not local and neither is the RCPT TO
    // Another RCPT plugin may vouch for this recipient.
    txn.results.add(this, {msg: 'rcpt!local'});
    next();
}

exports.auth = function (cfg, connection, smtp_client) {

    connection.loginfo(this, `Configuring authentication for SMTP server ${cfg.host}:${cfg.port}`);
    smtp_client.on('capabilities', () => {
        connection.loginfo(this, 'capabilities received');

        if ('secured' in smtp_client) {
            connection.loginfo(this, 'secured is pending');
            if (smtp_client.secured === false) {
                connection.loginfo(this, "Waiting for STARTTLS to complete. AUTH postponed");
                return;
            }
        }

        function base64 (str) {
            const buffer = Buffer.from(str, 'UTF-8');
            return buffer.toString('base64');
        }

        if (cfg.auth_type === 'plain') {
            connection.loginfo(this, `Authenticating with AUTH PLAIN ${cfg.auth_user}`);
            smtp_client.send_command('AUTH', `PLAIN ${base64(`\0${cfg.auth_user}\0${cfg.auth_pass}`)}`);
            return
        }

        if (cfg.auth_type === 'login') {
            smtp_client.authenticating = true;
            smtp_client.authenticated = false;

            connection.loginfo(this, `Authenticating with AUTH LOGIN ${cfg.auth_user}`);
            smtp_client.send_command('AUTH', 'LOGIN');
            smtp_client.on('auth', () => {
                // do nothing
            });
            smtp_client.on('auth_username', () => {
                smtp_client.send_command(base64(cfg.auth_user));
            });
            smtp_client.on('auth_password', () => {
                smtp_client.send_command(base64(cfg.auth_pass));
            });
        }
    });
}

exports.forward_enabled = function (conn, dom_cfg) {

    const q_wants = conn.transaction.notes.get('queue.wants');
    if (q_wants && q_wants !== 'smtp_forward') {
        conn.logdebug(this, `skipping, unwanted (${q_wants})`);
        return false;
    }

    if (conn.relaying && !this.is_outbound_enabled(dom_cfg)) {
        conn.logdebug(this, 'skipping, outbound disabled');
        return false;
    }

    return true;
}

exports.queue_forward = function (next, connection) {
    const plugin = this;
    if (connection.remote.closed) return
    const txn = connection?.transaction;

    const cfg = plugin.get_config(connection);
    if (!plugin.forward_enabled(connection, cfg)) return next();

    smtp_client_mod.get_client_plugin(plugin, connection, cfg, (err, smtp_client) => {
        smtp_client.next = next;

        let rcpt = 0;

        if (cfg.auth_user) plugin.auth(cfg, connection, smtp_client);

        connection.loginfo(plugin, `forwarding to ${
            cfg.forwarding_host_pool ? 'host_pool' : `${cfg.host}:${cfg.port}`}`
        );

        function get_rs () {
            return connection?.transaction?.results ? connection.transaction.results : connection.results
        }

        function dead_sender () {
            if (smtp_client.is_dead_sender(plugin, connection)) {
                get_rs().add(plugin, { err: 'dead sender' });
                return true;
            }
            return false;
        }

        function send_rcpt () {
            if (dead_sender() || !txn) return;
            if (rcpt === txn.rcpt_to.length) {
                smtp_client.send_command('DATA');
                return;
            }
            smtp_client.send_command('RCPT', `TO:${txn.rcpt_to[rcpt].format(!smtp_client.smtp_utf8)}`);
            rcpt++;
        }

        smtp_client.on('mail', send_rcpt);

        if (cfg.one_message_per_rcpt) {
            smtp_client.on('rcpt', () => {
                smtp_client.send_command('DATA');
            });
        }
        else {
            smtp_client.on('rcpt', send_rcpt);
        }

        smtp_client.on('data', () => {
            if (dead_sender()) return;
            smtp_client.start_data(txn.message_stream);
        });

        smtp_client.on('dot', () => {
            if (dead_sender() || !txn) return;

            get_rs().add(plugin, { pass: smtp_client.response });
            if (rcpt < txn.rcpt_to.length) {
                smtp_client.send_command('RSET');
                return;
            }
            smtp_client.call_next(OK, smtp_client.response);
            smtp_client.release();
        });

        smtp_client.on('rset', () => {
            if (dead_sender() || !txn) return;
            smtp_client.send_command('MAIL', `FROM:${txn.mail_from}`);
        });

        smtp_client.on('bad_code', (code, msg) => {
            if (dead_sender() || !txn) return;
            smtp_client.call_next(((code && code[0] === '5') ? DENY : DENYSOFT), msg);
            smtp_client.release();
        });
    });
}

exports.get_mx_next_hop = next_hop => {
    // queue.wants && queue.next_hop are mechanisms for fine-grained MX routing.
    // Plugins can specify a queue to perform the delivery as well as a route. A
    // plugin that uses this is qmail-deliverable, which can direct email delivery
    // via smtp_forward, outbound (SMTP), and outbound (LMTP).
    const dest = new url.URL(next_hop);
    const mx = {
        priority: 0,
        port: dest.port || (dest.protocol === 'lmtp:' ? 24 : 25),
        exchange: dest.hostname,
    }
    if (dest.protocol === 'lmtp:') mx.using_lmtp = true;
    if (dest.auth) {
        mx.auth_type = 'plain';
        mx.auth_user = dest.auth.split(':')[0];
        mx.auth_pass = dest.auth.split(':')[1];
    }
    return mx;
}

exports.get_mx = function (next, hmail, domain) {

    const qw = hmail.todo.notes.get('queue.wants')
    if (qw && qw !== 'smtp_forward') return next()

    if (qw === 'smtp_forward' && hmail.todo.notes.get('queue.next_hop')) {
        return next(OK, this.get_mx_next_hop(hmail.todo.notes.get('queue.next_hop')));
    }

    const dom = this.cfg.main.domain_selector === 'mail_from' ? hmail.todo.mail_from.host.toLowerCase() : domain.toLowerCase();
    const cfg = this.cfg[dom];

    if (cfg === undefined) {
        this.logdebug(`using DNS MX for: ${domain}`);
        return next();
    }

    const mx_opts = [
        'auth_type', 'auth_user', 'auth_pass', 'bind', 'bind_helo', 'using_lmtp'
    ]

    const mx = {
        priority: 0,
        exchange: cfg.host || this.cfg.main.host,
        port: cfg.port || this.cfg.main.port || 25,
    }

    // apply auth/mx options
    mx_opts.forEach(o => {
        if (cfg[o] === undefined) return;
        mx[o] = this.cfg[dom][o];
    })

    next(OK, mx);
}
