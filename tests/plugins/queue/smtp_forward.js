'use strict';

const path         = require('path');

const Address      = require('address-rfc2821').Address;
const fixtures     = require('haraka-test-fixtures');

const OK = 906;

function _setup (done) {
    this.plugin = new fixtures.plugin('queue/smtp_forward');

    // switch config directory to 'tests/config'
    this.plugin.config = this.plugin.config.module_config(path.resolve('tests'));

    this.plugin.register();

    this.connection = new fixtures.connection.createConnection();
    this.connection.transaction = new fixtures.transaction.createTransaction();

    done();
}

exports.loadingTLSConfig = {
    'TLS enabled but no outbound config in tls.ini': test => {
        const plugin = new fixtures.plugin('queue/smtp_forward');
        test.expect(2);

        plugin.register();

        test.equal(plugin.tls_options, undefined);
        test.equal(plugin.register_hook.called, true);

        test.done();
    },
}

exports.register = {
    setUp : _setup,
    'register' (test) {
        test.expect(1);
        this.plugin.register();
        test.ok(this.plugin.cfg.main);
        test.done();
    },
}

exports.get_config = {
    setUp : _setup,
    'no recipient' (test) {
        test.expect(3);
        const cfg = this.plugin.get_config(this.connection);
        test.equal(cfg.host, 'localhost');
        test.equal(cfg.enable_tls, true);
        test.equal(cfg.one_message_per_rcpt, true);
        test.done();
    },
    'null recipient' (test) {
        test.expect(3);
        this.connection.transaction.rcpt_to.push(new Address('<>'));
        const cfg = this.plugin.get_config(this.connection);
        test.equal(cfg.host, 'localhost');
        test.equal(cfg.enable_tls, true);
        test.equal(cfg.one_message_per_rcpt, true);
        test.done();
    },
    'valid recipient' (test) {
        test.expect(3);
        this.connection.transaction.rcpt_to.push(
            new Address('<matt@example.com>')
        );
        const cfg = this.plugin.get_config(this.connection);
        test.equal(cfg.enable_tls, true);
        test.equal(cfg.one_message_per_rcpt, true);
        test.equal(cfg.host, 'localhost');
        test.done();
    },
    'valid recipient with route' (test) {
        test.expect(1);
        this.connection.transaction.rcpt_to.push(
            new Address('<matt@test.com>')
        );
        test.deepEqual(this.plugin.get_config(this.connection), {
            host: '1.2.3.4',
            enable_tls: true,
            auth_user: 'postmaster@test.com',
            auth_pass: 'superDuperSecret',
        });
        test.done();
    },
    'valid recipient with route & diff config' (test) {
        test.expect(1);
        this.connection.transaction.rcpt_to.push(
            new Address('<matt@test1.com>')
        );
        const cfg = this.plugin.get_config(this.connection);
        test.deepEqual(cfg, {
            host: '1.2.3.4',
            enable_tls: false
        });
        test.done();
    },
    'valid 2 recipients with same route' (test) {
        test.expect(1);
        this.connection.transaction.rcpt_to.push(
            new Address('<matt@test.com>'),
            new Address('<matt@test.com>')
        );
        const cfg = this.plugin.get_config(this.connection);
        test.deepEqual(cfg.host, '1.2.3.4' );
        test.done();
    },
    'null sender' (test) {
        test.expect(3);
        this.plugin.cfg.main.domain_selector = 'mail_from';
        this.connection.transaction.mail_from = new Address('<>');
        const cfg = this.plugin.get_config(this.connection);
        test.equal(cfg.host, 'localhost');
        test.equal(cfg.enable_tls, true);
        test.equal(cfg.one_message_per_rcpt, true);
        test.done();
    },
    'return mail_from domain configuration' (test) {
        test.expect(1);
        this.connection.transaction.mail_from = new Address('<matt@test2.com>');
        this.plugin.cfg.main.domain_selector = 'mail_from';
        const cfg = this.plugin.get_config(this.connection);
        test.deepEqual(cfg.host, '2.3.4.5');
        delete this.plugin.cfg.main.domain_selector; // clear this for future tests
        test.done();
    }
}

const hmail = { todo: { notes: {} } };
exports.get_mx = {
    setUp : _setup,
    'returns no outbound route for undefined domains' (test) {
        test.expect(2);
        function cb (code, mx) {
            test.equal(code, undefined);
            test.deepEqual(mx, undefined);
            test.done();
        }
        this.plugin.get_mx(cb, hmail, 'undefined.com');
    },
    'returns an outbound route for defined domains' (test) {
        test.expect(2);
        function cb (code, mx) {
            test.equal(code, OK);
            test.deepEqual(mx, {
                priority: 0, exchange: '1.2.3.4', port: 2555,
                auth_user: 'postmaster@test.com',
                auth_pass: 'superDuperSecret'
            });
            test.done();
        }
        this.plugin.get_mx(cb, hmail, 'test.com');
    },
}

exports.is_outbound_enabled = {
    setUp : _setup,
    'enable_outbound is true by default' (test) {
        test.expect(1);
        test.equal(this.plugin.is_outbound_enabled(this.plugin.cfg), true);
        test.done();
    },
    'per-domain enable_outbound is true by default' (test) {
        test.expect(1);
        this.connection.transaction.rcpt_to = [ new Address('<postmaster@test.com>') ];
        const cfg = this.plugin.get_config(this.connection);
        test.equal(this.plugin.is_outbound_enabled(cfg), true);
        test.done();
    },
    'per-domain enable_outbound can be set to false' (test) {
        test.expect(1);
        this.plugin.cfg['test.com'].enable_outbound = false;
        this.connection.transaction.rcpt_to = [ new Address('<postmaster@test.com>') ];
        const cfg = this.plugin.get_config(this.connection);
        test.equal(this.plugin.is_outbound_enabled(cfg), false);
        test.done();
    },
    'per-domain enable_outbound is true even if top level is false' (test) {
        test.expect(1);
        this.plugin.cfg.main.enable_outbound = false; // this will be ignored
        this.plugin.cfg['test.com'].enable_outbound = true;
        this.connection.transaction.rcpt_to = [ new Address('<postmaster@test.com>') ];
        const cfg = this.plugin.get_config(this.connection);
        test.equal(this.plugin.is_outbound_enabled(cfg), true);
        test.done();
    }
}
