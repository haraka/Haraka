'use strict';
const assert = require('node:assert')

const { Address }  = require('address-rfc2821');
const fixtures     = require('haraka-test-fixtures');

const _set_up = (done) => {

    this.plugin = new fixtures.plugin('rcpt_to.host_list_base');
    this.plugin.cfg = {};
    this.plugin.host_list = {};

    this.connection = fixtures.connection.createConnection();
    this.connection.init_transaction()

    done();
}

describe('rcpt_to.host_list_base', () => {

    describe('in_host_list', () => {
        beforeEach(_set_up)

        it('miss', () => {
            assert.equal(false, this.plugin.in_host_list('test.com'));
        })

        it('hit', () => {
            this.plugin.host_list['test.com'] = true;
            assert.equal(true, this.plugin.in_host_list('test.com'));
        })
    })

    describe('in_host_regex', () => {
        beforeEach(_set_up)

        it('undef', () => {
            const r = this.plugin.in_host_regex('test.com');
            assert.equal(false, r);
        })

        it('miss', () => {
            this.plugin.host_list_regex=['miss.com'];
            this.plugin.hl_re = new RegExp (`^(?:${this.plugin.host_list_regex.join('|')})$`, 'i');
            const r = this.plugin.in_host_regex('test.com');
            assert.equal(false, r);
        })

        it('exact hit', () => {
            this.plugin.host_list_regex=['test.com'];
            this.plugin.hl_re = new RegExp (`^(?:${this.plugin.host_list_regex.join('|')})$`, 'i');
            const r = this.plugin.in_host_regex('test.com');
            assert.equal(true, r);
        })

        it('re hit', () => {
            this.plugin.host_list_regex=['.*est.com'];
            this.plugin.hl_re = new RegExp (`^(?:${this.plugin.host_list_regex.join('|')})$`, 'i');
            const r = this.plugin.in_host_regex('test.com');
            assert.equal(true, r);
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
                const res = this.connection.transaction.results.get('rcpt_to.host_list_base');
                assert.notEqual(-1, res.msg.indexOf('mail_from!local'));
                done();
            }, this.connection, [new Address('<user@example.com>')]);
        })

        it('hit', (done) => {
            this.plugin.host_list = { 'example.com': true };
            this.plugin.hook_mail((rc, msg) => {
                assert.equal(undefined, rc);
                assert.equal(undefined, msg);
                const res = this.connection.transaction.results.get('rcpt_to.host_list_base');
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
                const res = this.connection.transaction.results.get('rcpt_to.host_list_base');
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
                const res = this.connection.transaction.results.get('rcpt_to.host_list_base');
                assert.notEqual(-1, res.pass.indexOf('mail_from'));
                done();
            }, this.connection, [new Address('<user@example.com>')]);
        })
    })
})
