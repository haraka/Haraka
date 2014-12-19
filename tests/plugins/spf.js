'use strict';

var Connection   = require('../fixtures/stub_connection'),
    Plugin       = require('../fixtures/stub_plugin'),
    SPF          = require('../../spf').SPF,
    config       = require('../../config'),
    Address      = require('../../address').Address;

var spf = new SPF();

var _set_up = function (done) {

    // needed for tests
    this.plugin = new Plugin('spf');
    this.plugin.config = config;
    this.plugin.cfg = { main: { }, defer: {}, deny: {} };

    this.connection = Connection.createConnection();

    done();
};

exports.return_results = {
    setUp : _set_up,
    'result, none': function (test) {
        var next = function () {
            test.equal(undefined, arguments[0]);
            test.done();
        };
        test.expect(1);
        this.plugin.return_results(next, this.connection, 
            spf, 'mfrom', spf.NONE, 'test@example.com');
    },
    'result, neutral': function (test) {
        var next = function () {
            test.equal(undefined, arguments[0]);
            test.done();
        };
        test.expect(1);
        this.plugin.return_results(next, this.connection,
            spf, 'mfrom', spf.NEUTRAL, 'test@example.com');
    },
    'result, pass': function (test) {
        var next = function () {
            test.equal(undefined, arguments[0]);
            test.done();
        };
        test.expect(1);
        this.plugin.return_results(next, this.connection,
            spf, 'mfrom', spf.SPF_PASS, 'test@example.com');
    },
    'result, softfail, reject=false': function (test) {
        var next = function () {
            test.equal(undefined, arguments[0]);
            test.done();
        };
        test.expect(1);
        this.plugin.cfg.deny.mfrom_softfail=false;
        this.plugin.return_results(next, this.connection,
            spf, 'mfrom', spf.SPF_SOFTFAIL, 'test@example.com');
    },
    'result, softfail, reject=true': function (test) {
        var next = function () {
            test.equal(DENY, arguments[0]);
            test.done();
        };
        test.expect(1);
        this.plugin.cfg.deny.mfrom_softfail=true;
        this.plugin.return_results(next, this.connection, spf,
            'mfrom', spf.SPF_SOFTFAIL, 'test@example.com');
    },
    'result, fail, reject=false': function (test) {
        var next = function () {
            test.equal(undefined, arguments[0]);
            test.done();
        };
        test.expect(1);
        this.plugin.cfg.deny.mfrom_fail=false;
        this.plugin.return_results(next, this.connection, spf,
            'mfrom', spf.SPF_FAIL, 'test@example.com');
    },
    'result, fail, reject=true': function (test) {
        var next = function () {
            test.equal(DENY, arguments[0]);
            test.done();
        };
        test.expect(1);
        this.plugin.cfg.deny.mfrom_fail=true;
        this.plugin.return_results(next, this.connection, spf,
            'mfrom', spf.SPF_FAIL, 'test@example.com');
    },
    'result, temperror, reject=false': function (test) {
        var next = function () {
            test.equal(undefined, arguments[0]);
            test.done();
        };
        test.expect(1);
        this.plugin.cfg.defer.mfrom_temperror=false;
        this.plugin.return_results(next, this.connection, spf,
            'mfrom', spf.SPF_TEMPERROR, 'test@example.com');
    },
    'result, temperror, reject=true': function (test) {
        var next = function () {
            test.equal(DENYSOFT, arguments[0]);
            test.done();
        };
        test.expect(1);
        this.plugin.cfg.defer.mfrom_temperror=true;
        this.plugin.return_results(next, this.connection, spf,
            'mfrom', spf.SPF_TEMPERROR, 'test@example.com');
    },
    'result, permerror, reject=false': function (test) {
        var next = function () {
            test.equal(undefined, arguments[0]);
            test.done();
        };
        test.expect(1);
        this.plugin.cfg.deny.mfrom_permerror=false;
        this.plugin.return_results(next, this.connection, spf,
            'mfrom', spf.SPF_PERMERROR, 'test@example.com');
    },
    'result, permerror, reject=true': function (test) {
        var next = function () {
            test.equal(DENY, arguments[0]);
            test.done();
        };
        test.expect(1);
        this.plugin.cfg.deny.mfrom_permerror=true;
        this.plugin.return_results(next, this.connection, spf,
            'mfrom', spf.SPF_PERMERROR, 'test@example.com');
    },
    'result, unknown': function (test) {
        var next = function () {
            test.equal(undefined, arguments[0]);
            test.done();
        };
        test.expect(1);
        this.plugin.return_results(next, this.connection, spf,
            'mfrom', 'unknown', 'test@example.com');
    },
};

exports.hook_helo = {
    setUp : _set_up,
    'rfc1918': function (test) {
        var completed = 0;
        var next = function (rc) {
            completed++;
            test.equal(undefined, rc);
            if (completed >= 3) test.done();
        };
        test.expect(3);
        this.connection.remote_ip='192.168.1.1';
        this.plugin.hook_helo(next, this.connection);
        this.connection.remote_ip='10.0.1.1';
        this.plugin.hook_helo(next, this.connection);
        this.connection.remote_ip='127.0.0.1';
        this.plugin.hook_helo(next, this.connection, 'helo.sender.com');
    },
    'IPv4 literal': function (test) {
        var next = function (rc) {
            test.equal(undefined, rc);
            test.done();
        };
        test.expect(1);
        this.connection.remote_ip='190.168.1.1';
        this.plugin.hook_helo(next, this.connection, '[190.168.1.1]' );
    },

};

exports.hook_mail = {
    setUp : _set_up,
    'rfc1918': function (test) {
        var next = function () {
            test.equal(undefined, arguments[0]);
            test.done();
        };
        test.expect(1);
        this.connection.remote_ip='192.168.1.1';
        this.plugin.hook_mail(next, this.connection);
    },
    'rfc1918 relaying': function (test) {
        var next = function () {
            test.equal(undefined, arguments[0]);
            test.done();
        };
        test.expect(1);
        this.connection.remote_ip='192.168.1.1';
        this.connection.relaying=true;
        this.plugin.hook_mail(next, this.connection);
    },
    'no txn': function (test) {
        var next = function () {
            test.equal(undefined, arguments[0]);
            test.done();
        };
        test.expect(1);
        this.connection.remote_ip='207.85.1.1';
        this.plugin.hook_mail(next, this.connection);
    },
    'txn, no helo': function (test) {
        var next = function () {
            test.equal(undefined, arguments[0]);
            test.done();
        };
        test.expect(1);
        this.connection.remote_ip='207.85.1.1';
        this.plugin.hook_mail(next, this.connection,
            [new Address('<test@example.com>')]);
    },
    'txn': function (test) {
        var next = function (rc) {
            test.equal(undefined, rc);
            test.done();
        };
        test.expect(1);
        this.connection.remote_ip='207.85.1.1';
        this.connection.hello_host = 'mail.example.com';
        this.plugin.hook_mail(next, this.connection,
            [new Address('<test@example.com>')]);
    },
    'txn, relaying': function (test) {
        var next = function (rc) {
            test.equal(undefined, rc);
            test.done();
        };
        test.expect(1);
        this.connection.remote_ip='207.85.1.1';
        this.connection.relaying=true;
        this.connection.hello_host = 'mail.example.com';
        this.plugin.hook_mail(next, this.connection,
            [new Address('<test@example.com>')]);
    },
};

