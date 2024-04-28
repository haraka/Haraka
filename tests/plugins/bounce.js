'use strict';
const assert = require('node:assert')

const Address      = require('address-rfc2821');
const fixtures     = require('haraka-test-fixtures');
const message      = require('haraka-email-message')

const Connection   = fixtures.connection;

const _set_up = (done) => {

    this.plugin = new fixtures.plugin('bounce');
    this.plugin.cfg = {
        main: { },
        check: {
            reject_all: false,
            single_recipient: true,
            empty_return_path: true,
            bad_rcpt: true,
            non_local_msgid: true,
        },
        reject: {
            single_recipient:true,
            empty_return_path:true,
            non_local_msgid:true,
        },
        invalid_addrs: { 'test@bad1.com': true, 'test@bad2.com': true },
    };

    this.connection = Connection.createConnection();
    this.connection.remote.ip = '8.8.8.8';
    this.connection.transaction = {
        header: new message.Header(),
        results: new fixtures.results(this.plugin),
    };

    done();
}

describe('plugins/bounce', () => {
    
    describe('load_configs', () => {
        beforeEach(_set_up)

        it('load_bounce_ini', () => {
            this.plugin.load_bounce_ini();
            assert.ok(this.plugin.cfg.main);
            assert.ok(this.plugin.cfg.check);
            assert.ok(this.plugin.cfg.reject);
        })

        it('load_bounce_bad_rcpt', () => {
            this.plugin.load_bounce_bad_rcpt();
            assert.ok(this.plugin.cfg.main);
            assert.ok(this.plugin.cfg.check);
            assert.ok(this.plugin.cfg.reject);
        })
    })

    describe('reject_all', () => {
        beforeEach(_set_up)

        it('disabled', (done) => {
            this.connection.transaction.mail_from= new Address.Address('<matt@example.com>');
            this.connection.transaction.rcpt_to= [ new Address.Address('test@any.com') ];
            this.plugin.cfg.check.reject_all=false;
            this.plugin.reject_all((rc) => {
                assert.equal(rc, undefined);
                done()
            }, this.connection, new Address.Address('<matt@example.com>'));
        })

        it('not bounce ok', (done) => {
            this.connection.transaction.mail_from= new Address.Address('<matt@example.com>');
            this.connection.transaction.rcpt_to= [ new Address.Address('test@any.com') ];
            this.plugin.cfg.check.reject_all=true;
            this.plugin.reject_all((code) => {
                assert.equal(code, undefined);
                done()
            }, this.connection, new Address.Address('<matt@example.com>'));
        })

        it('bounce rejected', (done) => {
            this.connection.transaction.mail_from= new Address.Address('<>');
            this.connection.transaction.rcpt_to= [ new Address.Address('test@any.com') ];
            this.plugin.cfg.check.reject_all=true;
            this.plugin.reject_all((code) => {
                assert.equal(code, DENY);
                done()
            }, this.connection, new Address.Address('<>'));
        })
    })

    describe('empty_return_path', () => {
        beforeEach(_set_up)

        it('none', (done) => {
            this.connection.transaction.mail_from= new Address.Address('<>');
            this.connection.transaction.rcpt_to= [ new Address.Address('test@good.com') ];
            this.plugin.empty_return_path((rc) => {
                assert.equal(rc, undefined);
                done()
            }, this.connection);
        })

        it('has', (done) => {
            this.connection.transaction.mail_from= new Address.Address('<>');
            this.connection.transaction.rcpt_to= [ new Address.Address('test@good.com') ];
            this.connection.transaction.header.add('Return-Path', "Content doesn't matter");
            this.plugin.empty_return_path((rc) => {
                assert.equal(rc, DENY);
                done()
            }, this.connection);
        })
    })

    describe('non_local_msgid', () => {
        beforeEach(_set_up)

        it('no_msgid_in_headers', (done) => {
            this.connection.transaction.mail_from= new Address.Address('<>');
            this.connection.transaction.rcpt_to= [ new Address.Address('test@good.com') ];
            this.connection.transaction.body = new message.Body();
            this.connection.transaction.body.bodytext = '';
            this.plugin.non_local_msgid((rc) => {
                assert.equal(rc, DENY);
                done()
            }, this.connection);
        })

        it('no_domains_in_msgid', (done) => {
            this.connection.transaction.mail_from= new Address.Address('<>');
            this.connection.transaction.rcpt_to= [ new Address.Address('test@good.com') ];
            this.connection.transaction.body = new message.Body();
            this.connection.transaction.body.bodytext = 'Message-ID:<blah>';
            this.plugin.non_local_msgid((rc) => {
                assert.equal(rc, DENY);
                done()
            }, this.connection);
        })

        it('invalid_domain', (done) => {
            this.connection.transaction.mail_from= new Address.Address('<>');
            this.connection.transaction.rcpt_to= [ new Address.Address('test@good.com') ];
            this.connection.transaction.body = new message.Body();
            this.connection.transaction.body.bodytext = 'Message-ID: <blah@foo.cooooooom>';
            this.plugin.non_local_msgid((rc, msg) => {
                assert.equal(rc, DENY);
                assert.ok(/without valid domain/.test(msg));
                done()
            }, this.connection);
        })
        /* - commented out because the code looks bogus to me - see comment in plugins/bounce.js - @baudehlo
        it('non-local': function, () => {
            this.connection.transaction.mail_from= new Address.Address('<>');
            this.connection.transaction.rcpt_to= [ new Address.Address('test@good.com') ];
            this.connection.transaction.body = new message.Body();
            this.connection.transaction.body.bodytext = 'Message-ID: <blah@foo.com>';
            this.plugin.non_local_msgid((rc, msg) {
                assert.equal(rc, DENY);
                assert.ok(/non-local Message-ID/.test(msg));
            }, this.connection);
        })
        */
    })

    describe('single_recipient', () => {
        beforeEach(_set_up)

        it('valid', (done) => {
            this.connection.transaction.mail_from= new Address.Address('<>');
            this.connection.transaction.rcpt_to= [ new Address.Address('test@good.com') ];
            this.plugin.single_recipient((rc) => {
                assert.equal(rc, undefined);
                done()
            }, this.connection);
        })
        it('invalid', (done) => {
            this.connection.transaction.mail_from= new Address.Address('<>');
            this.connection.transaction.rcpt_to= [
                new Address.Address('test@good.com'),
                new Address.Address('test2@good.com')
            ];
            this.plugin.single_recipient((rc) => {
                assert.equal(rc, DENY);
                done()
            }, this.connection);
        })
        it('test@example.com', (done) => {
            this.connection.transaction.mail_from= new Address.Address('<>');
            this.connection.transaction.rcpt_to= [ new Address.Address('test@example.com') ];
            this.plugin.single_recipient((rc) => {
                assert.equal(rc, undefined);
                done()
            }, this.connection);
        })

        it('test@example.com,test2@example.com', (done) => {
            this.connection.transaction.mail_from = new Address.Address('<>');
            this.connection.transaction.rcpt_to = [
                new Address.Address('test1@example.com'),
                new Address.Address('test2@example.com'),
            ];
            this.plugin.single_recipient((rc) => {
                assert.equal(rc, DENY);
                done()
            }, this.connection);
        })
    })

    describe('bad_rcpt', () => {
        beforeEach(_set_up)

        it('test@good.com', (done) => {
            this.connection.transaction.mail_from= new Address.Address('<>');
            this.connection.transaction.rcpt_to= [ new Address.Address('test@good.com') ];
            this.plugin.bad_rcpt((rc) => {
                assert.equal(rc, undefined);
                done()
            }, this.connection);
        })

        it('test@bad1.com', (done) => {
            this.connection.transaction.mail_from= new Address.Address('<>');
            this.connection.transaction.rcpt_to= [ new Address.Address('test@bad1.com') ];
            this.plugin.cfg.invalid_addrs = {'test@bad1.com': true, 'test@bad2.com': true };
            this.plugin.bad_rcpt((rc) => {
                assert.equal(rc, DENY);
                done()
            }, this.connection);
        })

        it('test@bad1.com, test@bad2.com', (done) => {
            this.connection.transaction.mail_from= new Address.Address('<>');
            this.connection.transaction.rcpt_to= [
                new Address.Address('test@bad1.com'),
                new Address.Address('test@bad2.com')
            ];
            this.plugin.cfg.invalid_addrs = {'test@bad1.com': true, 'test@bad2.com': true };
            this.plugin.bad_rcpt((rc) => {
                assert.equal(rc, DENY);
                done()
            }, this.connection);
        })

        it('test@good.com, test@bad2.com', (done) => {
            this.connection.transaction.mail_from= new Address.Address('<>');
            this.connection.transaction.rcpt_to= [
                new Address.Address('test@good.com'),
                new Address.Address('test@bad2.com')
            ];
            this.plugin.cfg.invalid_addrs = {'test@bad1.com': true, 'test@bad2.com': true };
            this.plugin.bad_rcpt((rc) => {
                assert.equal(rc, DENY);
                done()
            }, this.connection);
        })
    })

    describe('has_null_sender', () => {
        beforeEach(_set_up)

        it('<>', () => {
            this.connection.transaction.mail_from= new Address.Address('<>');
            assert.equal(this.plugin.has_null_sender(this.connection), true);
        })

        it(' ', () => {
            this.connection.transaction.mail_from= new Address.Address('');
            assert.equal(this.plugin.has_null_sender(this.connection), true);
        })

        it('user@example', () => {
            this.connection.transaction.mail_from= new Address.Address('user@example');
            assert.equal(this.plugin.has_null_sender(this.connection), false);
        })

        it('user@example.com', () => {
            this.connection.transaction.mail_from= new Address.Address('user@example.com');
            assert.equal(this.plugin.has_null_sender(this.connection), false);
        })
    })
})
