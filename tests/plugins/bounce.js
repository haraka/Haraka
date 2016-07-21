'use strict';

var Address      = require('address-rfc2821');
var fixtures     = require('haraka-test-fixtures');

var Connection   = fixtures.connection;
var ResultStore  = fixtures.result_store;

var Body         = require('../../mailbody').Body;
var Header       = require('../../mailheader').Header;

var _set_up = function (done) {

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
        header: new Header(),
        results: new ResultStore(this.plugin),
    };

    done();
};

exports.load_configs = {
    setUp : _set_up,
    'load_bounce_ini': function (test) {
        test.expect(3);
        this.plugin.load_bounce_ini();
        test.ok(this.plugin.cfg.main);
        test.ok(this.plugin.cfg.check);
        test.ok(this.plugin.cfg.reject);
        test.done();
    },
    'load_bounce_bad_rcpt': function (test) {
        test.expect(3);
        this.plugin.load_bounce_bad_rcpt();
        test.ok(this.plugin.cfg.main);
        test.ok(this.plugin.cfg.check);
        test.ok(this.plugin.cfg.reject);
        test.done();
    },
};

exports.reject_all = {
    setUp : _set_up,
    'disabled': function (test) {
        test.expect(1);
        this.connection.transaction.mail_from= new Address.Address('<matt@example.com>');
        this.connection.transaction.rcpt_to= [ new Address.Address('test@any.com') ];
        var cb = function () {
            test.equal(undefined, arguments[0]);
        };
        this.plugin.cfg.check.reject_all=false;
        this.plugin.reject_all(cb, this.connection, new Address.Address('<matt@example.com>'));
        test.done();
    },
    'not bounce ok': function (test) {
        test.expect(1);
        this.connection.transaction.mail_from= new Address.Address('<matt@example.com>');
        this.connection.transaction.rcpt_to= [ new Address.Address('test@any.com') ];
        var cb = function () {
            test.equal(undefined, arguments[0]);
        };
        this.plugin.cfg.check.reject_all=true;
        this.plugin.reject_all(cb, this.connection, new Address.Address('<matt@example.com>'));
        test.done();
    },
    'bounce rejected': function (test) {
        test.expect(1);
        this.connection.transaction.mail_from= new Address.Address('<>');
        this.connection.transaction.rcpt_to= [ new Address.Address('test@any.com') ];
        var cb = function () {
            test.equal(DENY, arguments[0]);
        };
        this.plugin.cfg.check.reject_all=true;
        this.plugin.reject_all(cb, this.connection, new Address.Address('<>'));
        test.done();
    },
};

exports.empty_return_path = {
    setUp : _set_up,
    'none': function (test) {
        test.expect(1);
        this.connection.transaction.mail_from= new Address.Address('<>');
        this.connection.transaction.rcpt_to= [ new Address.Address('test@good.com') ];
        var cb = function () {
            test.equal(undefined, arguments[0]);
        };
        this.plugin.empty_return_path(cb, this.connection);
        test.done();
    },
    'has': function (test) {
        test.expect(1);
        this.connection.transaction.mail_from= new Address.Address('<>');
        this.connection.transaction.rcpt_to= [ new Address.Address('test@good.com') ];
        this.connection.transaction.header.add('Return-Path', "Content doesn't matter");
        var cb = function () {
            test.equal(DENY, arguments[0]);
        };
        this.plugin.empty_return_path(cb, this.connection);
        test.done();
    },
};

exports.non_local_msgid = {
    setUp: _set_up,
    'no_msgid_in_headers': function (test) {
        test.expect(1);
        this.connection.transaction.mail_from= new Address.Address('<>');
        this.connection.transaction.rcpt_to= [ new Address.Address('test@good.com') ];
        this.connection.transaction.body = new Body();
        this.connection.transaction.body.bodytext = '';
        var cb = function () {
            test.equal(DENY, arguments[0]);
        }
        this.plugin.non_local_msgid(cb, this.connection);
        test.done();
    },
    'no_domains_in_msgid': function (test) {
        test.expect(1);
        this.connection.transaction.mail_from= new Address.Address('<>');
        this.connection.transaction.rcpt_to= [ new Address.Address('test@good.com') ];
        this.connection.transaction.body = new Body();
        this.connection.transaction.body.bodytext = 'Message-ID:<blah>';
        var cb = function () {
            test.equal(DENY, arguments[0]);
        }
        this.plugin.non_local_msgid(cb, this.connection);
        test.done();
    },
    'invalid_domain': function (test) {
        test.expect(2);
        this.connection.transaction.mail_from= new Address.Address('<>');
        this.connection.transaction.rcpt_to= [ new Address.Address('test@good.com') ];
        this.connection.transaction.body = new Body();
        this.connection.transaction.body.bodytext = 'Message-ID: <blah@foo.cooooooom>';
        var cb = function () {
            test.equal(DENY, arguments[0]);
            test.ok(/without valid domain/.test(arguments[1]));
        }
        this.plugin.non_local_msgid(cb, this.connection);
        test.done();
    },
    /* - commented out because the code looks bogus to me - see comment in plugins/bounce.js - @baudehlo
    'non-local': function (test) {
        test.expect(2);
        this.connection.transaction.mail_from= new Address.Address('<>');
        this.connection.transaction.rcpt_to= [ new Address.Address('test@good.com') ];
        this.connection.transaction.body = new Body();
        this.connection.transaction.body.bodytext = 'Message-ID: <blah@foo.com>';
        var cb = function () {
            test.equal(DENY, arguments[0]);
            test.ok(/non-local Message-ID/.test(arguments[1]));
        }
        this.plugin.non_local_msgid(cb, this.connection);
        test.done();
    },
    */
}

exports.single_recipient = {
    setUp : _set_up,
    'valid': function (test) {
        test.expect(1);
        this.connection.transaction.mail_from= new Address.Address('<>');
        this.connection.transaction.rcpt_to= [ new Address.Address('test@good.com') ];
        var cb = function () {
            test.equal(undefined, arguments[0]);
        };
        this.plugin.single_recipient(cb, this.connection);
        test.done();
    },
    'invalid': function (test) {
        test.expect(1);
        this.connection.transaction.mail_from= new Address.Address('<>');
        this.connection.transaction.rcpt_to= [
            new Address.Address('test@good.com'),
            new Address.Address('test2@good.com')
        ];
        var cb = function () {
            console.log(arguments[0]);
            test.equal(DENY, arguments[0]);
        };
        this.plugin.single_recipient(cb, this.connection);
        test.done();
    },
    'test@example.com': function (test) {
        test.expect(1);
        this.connection.transaction.mail_from= new Address.Address('<>');
        this.connection.transaction.rcpt_to= [ new Address.Address('test@example.com') ];
        var cb = function () {
            test.equal(undefined, arguments[0]);
        };
        this.plugin.single_recipient(cb, this.connection);
        test.done();
    },
    'test@example.com,test2@example.com': function (test) {
        test.expect(1);
        this.connection.transaction.mail_from= new Address.Address('<>');
        this.connection.transaction.rcpt_to= [
            new Address.Address('test1@example.com'),
            new Address.Address('test2@example.com'),
        ];
        var cb = function () {
            test.equal(DENY, arguments[0]);
        };
        this.plugin.single_recipient(cb, this.connection);
        test.done();
    },
};

exports.bad_rcpt = {
    setUp : _set_up,
    'test@good.com': function (test) {
        test.expect(1);
        this.connection.transaction.mail_from= new Address.Address('<>');
        this.connection.transaction.rcpt_to= [ new Address.Address('test@good.com') ];
        var cb = function (rc) {
            test.equal(undefined, rc);
        };
        this.plugin.bad_rcpt(cb, this.connection);
        test.done();
    },
    'test@bad1.com': function (test) {
        test.expect(1);
        this.connection.transaction.mail_from= new Address.Address('<>');
        this.connection.transaction.rcpt_to= [ new Address.Address('test@bad1.com') ];
        var cb = function (rc) {
            test.equal(DENY, rc);
        };
        this.plugin.cfg.invalid_addrs = {'test@bad1.com': true, 'test@bad2.com': true };
        this.plugin.bad_rcpt(cb, this.connection);
        test.done();
    },
    'test@bad1.com, test@bad2.com': function (test) {
        test.expect(1);
        this.connection.transaction.mail_from= new Address.Address('<>');
        this.connection.transaction.rcpt_to= [
            new Address.Address('test@bad1.com'),
            new Address.Address('test@bad2.com')
        ];
        var cb = function (rc) {
            test.equal(DENY, rc);
        };
        this.plugin.cfg.invalid_addrs = {'test@bad1.com': true, 'test@bad2.com': true };
        this.plugin.bad_rcpt(cb, this.connection);
        test.done();
    },
    'test@good.com, test@bad2.com': function (test) {
        test.expect(1);
        this.connection.transaction.mail_from= new Address.Address('<>');
        this.connection.transaction.rcpt_to= [
            new Address.Address('test@good.com'),
            new Address.Address('test@bad2.com')
        ];
        var cb = function (rc) {
            test.equal(DENY, rc);
        };
        this.plugin.cfg.invalid_addrs = {'test@bad1.com': true, 'test@bad2.com': true };
        this.plugin.bad_rcpt(cb, this.connection);
        test.done();
    },
};

exports.has_null_sender = {
    setUp : _set_up,
    '<>': function (test) {
        test.expect(1);
        this.connection.transaction.mail_from= new Address.Address('<>');
        test.equal(true, this.plugin.has_null_sender(this.connection));
        test.done();
    },
    ' ': function (test) {
        test.expect(1);
        this.connection.transaction.mail_from= new Address.Address('');
        test.equal(true, this.plugin.has_null_sender(this.connection));
        test.done();
    },
    'user@example': function (test) {
        test.expect(1);
        this.connection.transaction.mail_from= new Address.Address('user@example');
        test.equal(false, this.plugin.has_null_sender(this.connection));
        test.done();
    },
    'user@example.com': function (test) {
        test.expect(1);
        this.connection.transaction.mail_from= new Address.Address('user@example.com');
        test.equal(false, this.plugin.has_null_sender(this.connection));
        test.done();
    },
};
