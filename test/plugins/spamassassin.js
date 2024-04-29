'use strict';
const assert = require('node:assert')

const Address      = require('address-rfc2821');
const fixtures     = require('haraka-test-fixtures');

const _set_up = (done) => {

    this.plugin = new fixtures.plugin('spamassassin');
    this.plugin.cfg = {
        main: {
            spamc_auth_header: 'X-Haraka-Relaying123'
        },
        check: {},
    };

    this.connection = fixtures.connection.createConnection();
    this.connection.init_transaction()

    done();
}

describe('spamassassin', () => {
    beforeEach(_set_up)

    describe('register', () => {

        it('loads the spamassassin plugin', () => {
            assert.equal('spamassassin', this.plugin.name);
        })

        it('register loads spamassassin.ini', () => {
            this.plugin.register();
            assert.ok(this.plugin.cfg);
            assert.ok(this.plugin.cfg.main.spamd_socket);
        })
    })

    describe('load_spamassassin_ini', () => {
        beforeEach(_set_up)

        it('loads spamassassin.ini', () => {
            assert.equal(undefined, this.plugin.cfg.main.spamd_socket);
            this.plugin.load_spamassassin_ini();
            assert.ok(this.plugin.cfg.main.spamd_socket);
            assert.equal(this.plugin.cfg.main.spamc_auth_header, 'X-Haraka-Relay');
        })
    })

    describe('should_skip', () => {

        it('max_size not set', () => {
            assert.equal(false, this.plugin.should_skip(this.connection));
        })

        it('max_size 10, data_bytes 9 = false', () => {
            this.plugin.cfg.main = { max_size: 10 };
            this.connection.transaction.data_bytes = 9;
            assert.equal(false, this.plugin.should_skip(this.connection));
        })

        it('max_size 10, data_bytes 11 = true', () => {
            this.plugin.cfg.main = { max_size: 10 };
            this.connection.transaction.data_bytes = 11;
            assert.equal(true, this.plugin.should_skip(this.connection));
        })
    })

    describe('get_spamd_headers', () => {

        it('returns a spamd protocol request', () => {
            this.connection.transaction.mail_from = new Address.Address('<matt@example.com>');
            this.connection.transaction.uuid = 'THIS-IS-A-TEST-UUID';
            const headers = this.plugin.get_spamd_headers(this.connection, 'test_user');
            const expected_headers = [
                'HEADERS SPAMC/1.4',
                'User: test_user',
                '',
                'X-Envelope-From: matt@example.com',
                'X-Haraka-UUID: THIS-IS-A-TEST-UUID'
            ];
            assert.deepEqual(headers, expected_headers);
        })
    })

    describe('get_spamd_headers_relaying', () => {
        beforeEach(_set_up)

        it('returns a spamd protocol request when relaying', () => {
            this.connection.transaction.mail_from = new Address.Address('<matt@example.com>');
            this.connection.transaction.uuid = 'THIS-IS-A-TEST-UUID';
            this.connection.set('relaying', true);
            const headers = this.plugin.get_spamd_headers(this.connection, 'test_user');
            const expected_headers = [
                'HEADERS SPAMC/1.4',
                'User: test_user',
                '',
                'X-Envelope-From: matt@example.com',
                'X-Haraka-UUID: THIS-IS-A-TEST-UUID',
                'X-Haraka-Relaying123: true',
            ];
            assert.deepEqual(headers, expected_headers);
        })
    })

    describe('get_spamd_username', () => {
        beforeEach(_set_up)

        it('default', () => {
            assert.equal('default', this.plugin.get_spamd_username(this.connection));
        })

        it('set in txn.notes.spamd_user', () => {
            this.connection.transaction.notes.spamd_user = 'txuser';
            assert.equal('txuser', this.plugin.get_spamd_username(this.connection));
        })

        it('set in cfg.main.spamd_user', () => {
            this.plugin.cfg.main.spamd_user = 'cfguser';
            assert.equal('cfguser', this.plugin.get_spamd_username(this.connection));
        })

        it('set to first-recipient', () => {
            this.plugin.cfg.main.spamd_user = 'first-recipient';
            this.connection.transaction.rcpt_to = [ new Address.Address('<matt@example.com>') ];
            assert.equal('matt@example.com', this.plugin.get_spamd_username(this.connection));
        })
    })

    describe('score_too_high', () => {
        beforeEach(_set_up)

        it('no threshhold is not too high', () => {
            assert.ok(!this.plugin.score_too_high(this.connection, {score: 5}));
        })

        it('too high score is too high', () => {
            this.plugin.cfg.main.reject_threshold = 5;
            assert.equal('spam score exceeded threshold', this.plugin.score_too_high(this.connection, {score: 6}));
        })

        it('ok score with relaying is ok', () => {
            this.connection.relaying = true;
            this.plugin.cfg.main.relay_reject_threshold = 7;
            assert.equal('', this.plugin.score_too_high(this.connection, {score: 6}));
        })

        it('too high score with relaying is too high', () => {
            this.connection.relaying = true;
            this.plugin.cfg.main.relay_reject_threshold = 7;
            assert.equal('spam score exceeded relay threshold', this.plugin.score_too_high(this.connection, {score: 8}));
        })
    })
})
