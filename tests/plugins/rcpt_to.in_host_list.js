'use strict';

const Address      = require('address-rfc2821').Address;
const fixtures     = require('haraka-test-fixtures');

const _set_up = function (done) {

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
};

exports.in_host_list = {
    setUp : _set_up,
    'miss' : function (test) {
        test.expect(1);
        const r = this.plugin.in_host_list('test.com');
        test.equal(false, r);
        test.done();
    },
    'hit' : function (test) {
        test.expect(1);
        this.plugin.host_list['test.com'] = true;
        const r = this.plugin.in_host_list('test.com');
        test.equal(true, r);
        test.done();
    },
};

exports.in_host_regex = {
    setUp : _set_up,
    'undef' : function (test) {
        test.expect(1);
        const r = this.plugin.in_host_regex('test.com');
        test.equal(false, r);
        test.done();
    },
    'miss' : function (test) {
        test.expect(1);
        this.plugin.host_list_regex=['miss.com'];
        this.plugin.hl_re = new RegExp ('^(?:' + this.plugin.host_list_regex.join('|') + ')$', 'i');
        const r = this.plugin.in_host_regex('test.com');
        test.equal(false, r);
        test.done();
    },
    'exact hit' : function (test) {
        test.expect(1);
        this.plugin.host_list_regex=['test.com'];
        this.plugin.hl_re = new RegExp ('^(?:' + this.plugin.host_list_regex.join('|') + ')$', 'i');
        const r = this.plugin.in_host_regex('test.com');
        test.equal(true, r);
        test.done();
    },
    're hit' : function (test) {
        test.expect(1);
        this.plugin.host_list_regex=['.*est.com'];
        this.plugin.hl_re = new RegExp ('^(?:' + this.plugin.host_list_regex.join('|') + ')$', 'i');
        const r = this.plugin.in_host_regex('test.com');
        test.equal(true, r);
        test.done();
    },
};

exports.hook_mail = {
    setUp : _set_up,
    'null sender' : function (test) {
        test.expect(2);
        const next = function (rc, msg) {
            test.equal(undefined, rc);
            test.equal(undefined, msg);
            test.done();
        };
        this.connection.relaying=true;
        this.plugin.hook_mail(next, this.connection, [new Address('<>')]);
    },
    'miss' : function (test) {
        test.expect(3);
        const next = function (rc, msg) {
            test.equal(undefined, rc);
            test.equal(undefined, msg);
            const res = this.connection.transaction.results.get('rcpt_to.in_host_list');
            test.notEqual(-1, res.msg.indexOf('mail_from!local'));
            test.done();
        }.bind(this);
        this.plugin.host_list = { 'miss.com': true };
        this.plugin.hook_mail(next, this.connection, [new Address('<user@example.com>')]);
    },
    'hit' : function (test) {
        test.expect(3);
        const next = function (rc, msg) {
            test.equal(undefined, rc);
            test.equal(undefined, msg);
            const res = this.connection.transaction.results.get('rcpt_to.in_host_list');
            // console.log(res);
            test.notEqual(-1, res.pass.indexOf('mail_from'));
            test.done();
        }.bind(this);
        this.plugin.host_list = { 'example.com': true };
        this.plugin.hook_mail(next, this.connection, [new Address('<user@example.com>')]);
    },
    'hit, regex, exact' : function (test) {
        test.expect(3);
        const next = function (rc, msg) {
            test.equal(undefined, rc);
            test.equal(undefined, msg);
            const res = this.connection.transaction.results.get('rcpt_to.in_host_list');
            // console.log(res);
            test.notEqual(-1, res.pass.indexOf('mail_from'));
            test.done();
        }.bind(this);
        this.plugin.host_list_regex = ['example.com'];
        this.plugin.hl_re = new RegExp ('^(?:' + this.plugin.host_list_regex.join('|') + ')$', 'i');
        this.plugin.hook_mail(next, this.connection, [new Address('<user@example.com>')]);
    },
    'hit, regex, pattern' : function (test) {
        test.expect(3);
        const next = function (rc, msg) {
            test.equal(undefined, rc);
            test.equal(undefined, msg);
            const res = this.connection.transaction.results.get('rcpt_to.in_host_list');
            // console.log(res);
            test.notEqual(-1, res.pass.indexOf('mail_from'));
            test.done();
        }.bind(this);
        this.plugin.host_list_regex = ['.*mple.com'];
        this.plugin.hl_re = new RegExp ('^(?:' + this.plugin.host_list_regex.join('|') + ')$', 'i');
        this.plugin.hook_mail(next, this.connection, [new Address('<user@example.com>')]);
    },
};

exports.hook_rcpt = {
    setUp : _set_up,
    'missing txn' : function (test) {
        test.expect(1);
        // sometimes txn goes away, make sure it's handled
        const next = function (rc, msg) {
            test.equal(undefined, rc);
            test.equal(undefined, msg);
        };
        delete this.connection.transaction;
        this.plugin.hook_rcpt(next, this.connection, [new Address('test@test.com')]);
        test.ok(true);
        test.done();
    },
    'hit list' : function (test) {
        test.expect(2);
        const next = function (rc, msg) {
            test.equal(OK, rc);
            test.equal(undefined, msg);
            test.done();
        };
        this.plugin.host_list = { 'test.com': true };
        this.plugin.hook_rcpt(next, this.connection, [new Address('test@test.com')]);
    },
    'miss list' : function (test) {
        test.expect(2);
        const next = function (rc, msg) {
            test.equal(undefined, rc);
            test.equal(undefined, msg);
            test.done();
        };
        this.plugin.host_list = { 'miss.com': true };
        this.plugin.hook_rcpt(next, this.connection, [new Address('test@test.com')]);
    },
    'hit regex, exact' : function (test) {
        test.expect(2);
        const next = function (rc, msg) {
            test.equal(OK, rc);
            test.equal(undefined, msg);
            test.done();
        };
        this.plugin.host_list_regex=['test.com'];
        this.plugin.hl_re = new RegExp ('^(?:' + this.plugin.host_list_regex.join('|') + ')$', 'i');
        this.plugin.hook_rcpt(next, this.connection, [new Address('test@test.com')]);
    },
    'hit regex, pattern' : function (test) {
        test.expect(2);
        const next = function (rc, msg) {
            test.equal(OK, rc);
            test.equal(undefined, msg);
            test.done();
        };
        this.plugin.host_list_regex=['.est.com'];
        this.plugin.hl_re = new RegExp ('^(?:' + this.plugin.host_list_regex.join('|') + ')$', 'i');
        this.plugin.hook_rcpt(next, this.connection, [new Address('test@test.com')]);
    },
    'miss regex, pattern' : function (test) {
        test.expect(2);
        const next = function (rc, msg) {
            test.equal(undefined, rc);
            test.equal(undefined, msg);
            test.done();
        };
        this.plugin.host_list_regex=['a.est.com'];
        this.plugin.hl_re = new RegExp ('^(?:' + this.plugin.host_list_regex.join('|') + ')$', 'i');
        this.plugin.hook_rcpt(next, this.connection, [new Address('test@test.com')]);
    },
    'rcpt miss, relaying to local sender' : function (test) {
        test.expect(2);
        const next = function (rc, msg) {
            test.equal(OK, rc);
            test.equal(undefined, msg);
            test.done();
        };
        this.connection.relaying=true;
        this.connection.transaction.notes = { local_sender: true };
        this.plugin.hook_rcpt(next, this.connection, [new Address('test@test.com')]);
    },
};
