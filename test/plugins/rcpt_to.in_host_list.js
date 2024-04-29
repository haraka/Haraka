'use strict';
const assert = require('node:assert')

const { Address }  = require('address-rfc2821');
const fixtures     = require('haraka-test-fixtures');

const _set_up = (done) => {

    this.plugin = new fixtures.plugin('rcpt_to.in_host_list');
    this.plugin.inherits('rcpt_to.host_list_base');
    this.plugin.cfg = {};
    this.plugin.host_list = {};

    this.connection = fixtures.connection.createConnection();
    this.connection.transaction = {
        results: new fixtures.results(this.connection),
        notes: {},
    };

    done();
}

describe('in_host_list', () => {
    beforeEach(_set_up)

    it('miss', () => {
        assert.equal(this.plugin.in_host_list('test.com'), false);
    })

    it('hit', () => {
        this.plugin.host_list['test.com'] = true;
        assert.equal(this.plugin.in_host_list('test.com'), true);
    })

    describe('in_host_regex', () => {
        beforeEach(_set_up)

        it('undef', () => {
            assert.equal(this.plugin.in_host_regex('test.com'), false);
        })

        it('miss', () => {
            this.plugin.host_list_regex=['miss.com'];
            this.plugin.hl_re = new RegExp (`^(?:${this.plugin.host_list_regex.join('|')})$`, 'i');
            assert.equal(this.plugin.in_host_regex('test.com'), false);
        })

        it('exact hit', () => {
            this.plugin.host_list_regex=['test.com'];
            this.plugin.hl_re = new RegExp (`^(?:${this.plugin.host_list_regex.join('|')})$`, 'i');
            assert.equal(this.plugin.in_host_regex('test.com'), true);
        })

        it('re hit', () => {
            this.plugin.host_list_regex=['.*est.com'];
            this.plugin.hl_re = new RegExp (`^(?:${this.plugin.host_list_regex.join('|')})$`, 'i');
            assert.equal(this.plugin.in_host_regex('test.com'), true);
        })
    })

    describe('hook_mail', () => {
        beforeEach(_set_up)

        it('null sender', (done) => {
            this.connection.relaying=true;
            this.plugin.hook_mail((rc, msg) => {
                assert.equal(undefined, rc);
                assert.equal(undefined, msg);
                done();
            }, this.connection, [new Address('<>')]);
        })

        it('miss', (done) => {
            this.plugin.host_list = { 'miss.com': true };
            this.plugin.hook_mail((rc, msg) => {
                assert.equal(undefined, rc);
                assert.equal(undefined, msg);
                const res = this.connection.transaction.results.get('rcpt_to.in_host_list');
                assert.notEqual(-1, res.msg.indexOf('mail_from!local'));
                done();
            }, this.connection, [new Address('<user@example.com>')]);
        })

        it('hit', (done) => {
            this.plugin.host_list = { 'example.com': true };
            this.plugin.hook_mail((rc, msg) => {
                assert.equal(undefined, rc);
                assert.equal(undefined, msg);
                const res = this.connection.transaction.results.get('rcpt_to.in_host_list');
                assert.notEqual(-1, res.pass.indexOf('mail_from'));
                done();
            }, this.connection, [new Address('<user@example.com>')]);
        })

        it('hit, regex, exact', (done) => {
            this.plugin.host_list_regex = ['example.com'];
            this.plugin.hl_re = new RegExp (`^(?:${this.plugin.host_list_regex.join('|')})$`, 'i');
            this.plugin.hook_mail((rc, msg) => {
                assert.equal(undefined, rc);
                assert.equal(undefined, msg);
                const res = this.connection.transaction.results.get('rcpt_to.in_host_list');
                assert.notEqual(-1, res.pass.indexOf('mail_from'));
                done();
            }, this.connection, [new Address('<user@example.com>')]);
        })

        it('hit, regex, pattern', (done) => {
            this.plugin.host_list_regex = ['.*mple.com'];
            this.plugin.hl_re = new RegExp (`^(?:${this.plugin.host_list_regex.join('|')})$`, 'i');
            this.plugin.hook_mail((rc, msg) => {
                assert.equal(undefined, rc);
                assert.equal(undefined, msg);
                const res = this.connection.transaction.results.get('rcpt_to.in_host_list');
                // console.log(res);
                assert.notEqual(-1, res.pass.indexOf('mail_from'));
                done();
            }, this.connection, [new Address('<user@example.com>')]);
        })
    })

    describe('hook_rcpt', () => {
        beforeEach(_set_up)

        it('missing txn', (done) => {
            // sometimes txn goes away, make sure it's handled
            delete this.connection.transaction;
            this.plugin.hook_rcpt((rc, msg) => {
                assert.equal(undefined, rc);
                assert.equal(undefined, msg);
            }, this.connection, [new Address('test@test.com')]);
            assert.ok(true);
            done();
        })

        it('hit list', (done) => {
            this.plugin.host_list = { 'test.com': true };
            this.plugin.hook_rcpt((rc, msg) => {
                assert.equal(OK, rc);
                assert.equal(undefined, msg);
                done();
            }, this.connection, [new Address('test@test.com')]);
        })

        it('miss list', (done) => {
            this.plugin.host_list = { 'miss.com': true };
            this.plugin.hook_rcpt((rc, msg) => {
                assert.equal(undefined, rc);
                assert.equal(undefined, msg);
                done();
            }, this.connection, [new Address('test@test.com')]);
        })

        it('hit regex, exact', (done) => {
            this.plugin.host_list_regex=['test.com'];
            this.plugin.hl_re = new RegExp (`^(?:${this.plugin.host_list_regex.join('|')})$`, 'i');
            this.plugin.hook_rcpt((rc, msg) => {
                assert.equal(OK, rc);
                assert.equal(undefined, msg);
                done();
            }, this.connection, [new Address('test@test.com')]);
        })

        it('hit regex, pattern', (done) => {
            this.plugin.host_list_regex=['.est.com'];
            this.plugin.hl_re = new RegExp (`^(?:${this.plugin.host_list_regex.join('|')})$`, 'i');
            this.plugin.hook_rcpt((rc, msg) => {
                assert.equal(OK, rc);
                assert.equal(undefined, msg);
                done();
            }, this.connection, [new Address('test@test.com')]);
        })

        it('miss regex, pattern', (done) => {
            this.plugin.host_list_regex=['a.est.com'];
            this.plugin.hl_re = new RegExp (`^(?:${this.plugin.host_list_regex.join('|')})$`, 'i');
            this.plugin.hook_rcpt((rc, msg) => {
                assert.equal(undefined, rc);
                assert.equal(undefined, msg);
                done();
            }, this.connection, [new Address('test@test.com')]);
        })

        it('rcpt miss, relaying to local sender', (done) => {
            this.connection.relaying=true;
            this.connection.transaction.notes = { local_sender: true };
            this.plugin.hook_rcpt((rc, msg) => {
                assert.equal(OK, rc);
                assert.equal(undefined, msg);
                done();
            }, this.connection, [new Address('test@test.com')]);
        })
    })
})
