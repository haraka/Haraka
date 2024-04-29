'use strict';
const assert = require('node:assert')
const path = require('node:path');

const { Address } = require('address-rfc2821');
const fixtures    = require('haraka-test-fixtures');
const Notes       = require('haraka-notes')

const OK = 906;

const _setup = (done) => {
    this.plugin = new fixtures.plugin('queue/smtp_forward');

    // switch config directory to 'test/config'
    this.plugin.config = this.plugin.config.module_config(path.resolve('test'));

    this.plugin.register();
    this.hmail = { todo: { notes: new Notes() } };

    this.connection = new fixtures.connection.createConnection();
    this.connection.init_transaction();

    done();
}

describe('smtp_forward', () => {
    describe('tls config', () => {
        it('TLS enabled but no outbound config in tls.ini', () => {
            const plugin = new fixtures.plugin('queue/smtp_forward');
            plugin.register();

            assert.equal(plugin.tls_options, undefined);
            assert.equal(plugin.register_hook.called, true);
        })
    })

    describe('register', () => {
        beforeEach(_setup)

        it('register', () => {
            this.plugin.register();
            assert.ok(this.plugin.cfg.main);
        })
    })

    describe('get_config', () => {
        beforeEach(_setup)

        it('no recipient', () => {
            const cfg = this.plugin.get_config(this.connection);
            assert.equal(cfg.host, 'localhost');
            assert.equal(cfg.enable_tls, true);
            assert.equal(cfg.one_message_per_rcpt, true);
        })

        it('null recipient', () => {
            this.connection.transaction.rcpt_to.push(new Address('<>'));
            const cfg = this.plugin.get_config(this.connection);
            assert.equal(cfg.host, 'localhost');
            assert.equal(cfg.enable_tls, true);
            assert.equal(cfg.one_message_per_rcpt, true);
        })

        it('valid recipient', () => {
            this.connection.transaction.rcpt_to.push(
                new Address('<matt@example.com>')
            );
            const cfg = this.plugin.get_config(this.connection);
            assert.equal(cfg.enable_tls, true);
            assert.equal(cfg.one_message_per_rcpt, true);
            assert.equal(cfg.host, 'localhost');
        })

        it('valid recipient with route', () => {
            this.connection.transaction.rcpt_to.push(
                new Address('<matt@test.com>')
            );
            assert.deepEqual(this.plugin.get_config(this.connection), {
                host: '1.2.3.4',
                enable_tls: true,
                auth_user: 'postmaster@test.com',
                auth_pass: 'superDuperSecret',
            });
        })

        it('valid recipient with route & diff config', () => {
            this.connection.transaction.rcpt_to.push(
                new Address('<matt@test1.com>')
            );
            const cfg = this.plugin.get_config(this.connection);
            assert.deepEqual(cfg, {
                host: '1.2.3.4',
                enable_tls: false
            });
        })

        it('valid 2 recipients with same route', () => {
            this.connection.transaction.rcpt_to.push(
                new Address('<matt@test.com>'),
                new Address('<matt@test.com>')
            );
            const cfg = this.plugin.get_config(this.connection);
            assert.deepEqual(cfg.host, '1.2.3.4' );
        })

        it('null sender', () => {
            this.plugin.cfg.main.domain_selector = 'mail_from';
            this.connection.transaction.mail_from = new Address('<>');
            const cfg = this.plugin.get_config(this.connection);
            assert.equal(cfg.host, 'localhost');
            assert.equal(cfg.enable_tls, true);
            assert.equal(cfg.one_message_per_rcpt, true);
        })

        it('return mail_from domain configuration', () => {
            this.connection.transaction.mail_from = new Address('<matt@test2.com>');
            this.plugin.cfg.main.domain_selector = 'mail_from';
            const cfg = this.plugin.get_config(this.connection);
            assert.deepEqual(cfg.host, '2.3.4.5');
            delete this.plugin.cfg.main.domain_selector; // clear this for future tests
        })
    })

    describe('get_mx', () => {
        beforeEach(_setup)

        it('returns no outbound route for undefined domains', (done) => {
            this.plugin.get_mx((code, mx) => {
                assert.equal(code, undefined);
                assert.deepEqual(mx, undefined);
                done();
            }, this.hmail, 'undefined.com');
        })

        it('returns no outbound route when queue.wants !== smtp_forward', (done) => {
            this.hmail.todo.notes.set('queue.wants', 'outbound')
            this.hmail.todo.notes.set('queue.next_hop', 'smtp://5.4.3.2:26')
            this.plugin.get_mx((code, mx) => {
                assert.equal(code, undefined);
                assert.deepEqual(mx, undefined);
                done();
            }, this.hmail, 'undefined.com');
        })

        it('returns an outbound route for defined domains', (done) => {
            this.plugin.get_mx((code, mx) => {
                assert.equal(code, OK);
                assert.deepEqual(mx, {
                    priority: 0, exchange: '1.2.3.4', port: 2555,
                    auth_user: 'postmaster@test.com',
                    auth_pass: 'superDuperSecret'
                });
                done();
            }, this.hmail, 'test.com');
        })

        it('is enabled when queue.wants is set', (done) => {
            this.hmail.todo.notes.set('queue.wants', 'smtp_forward')
            this.hmail.todo.notes.set('queue.next_hop', 'smtp://4.3.2.1:465')
            this.plugin.get_mx((code, mx) => {
                assert.equal(code, OK);
                assert.deepEqual(mx, { priority: 0, port: 465, exchange: '4.3.2.1' });
                done();
            }, this.hmail, 'undefined.com');
        })

        it('sets using_lmtp when next_hop URL is lmtp', (done) => {
            this.hmail.todo.notes.set('queue.wants', 'smtp_forward')
            this.hmail.todo.notes.set('queue.next_hop', 'lmtp://4.3.2.1')
            this.plugin.get_mx((code, mx) => {
                assert.equal(code, OK);
                assert.deepEqual(mx, { priority: 0, port: 24, using_lmtp: true, exchange: '4.3.2.1' });
                done();
            }, this.hmail, 'undefined.com');
        })
    })

    describe('is_outbound_enabled', () => {
        beforeEach(_setup)

        it('enable_outbound is false by default', () => {
            assert.equal(this.plugin.is_outbound_enabled(this.plugin.cfg), false);
        })

        it('per-domain enable_outbound is false by default', () => {
            this.connection.transaction.rcpt_to = [ new Address('<postmaster@test.com>') ];
            const cfg = this.plugin.get_config(this.connection);
            assert.equal(this.plugin.is_outbound_enabled(cfg), false);
        })

        it('per-domain enable_outbound can be set to true', () => {
            this.plugin.cfg['test.com'].enable_outbound = true;
            this.connection.transaction.rcpt_to = [ new Address('<postmaster@test.com>') ];
            const cfg = this.plugin.get_config(this.connection);
            assert.equal(this.plugin.is_outbound_enabled(cfg), true);
        })

        it('per-domain enable_outbound is false even if top level is false', () => {
            this.plugin.cfg.main.enable_outbound = false; // this will be ignored
            this.plugin.cfg['test.com'].enable_outbound = false;
            this.connection.transaction.rcpt_to = [ new Address('<postmaster@test.com>') ];
            const cfg = this.plugin.get_config(this.connection);
            assert.equal(this.plugin.is_outbound_enabled(cfg), false);
        })
    })
})
