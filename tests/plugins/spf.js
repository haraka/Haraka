'use strict';

const Address      = require('address-rfc2821').Address;
const fixtures     = require('haraka-test-fixtures');

const SPF          = require('../../spf').SPF;
const spf          = new SPF();

const _set_up = function (done) {

    this.plugin = new fixtures.plugin('spf');
    this.plugin.load_config();
    this.plugin.timeout = 8000;

    // uncomment this line to see detailed SPF evaluation
    this.plugin.SPF.prototype.log_debug = function () {};

    this.connection = fixtures.connection.createConnection();
    this.connection.transaction = fixtures.transaction.createTransaction();
    this.connection.transaction.results = new fixtures.results(this.connection);

    done();
};

exports.return_results = {
    setUp : _set_up,
    'result, none': function (test) {
        const next = function () {
            test.equal(undefined, arguments[0]);
            test.done();
        };
        test.expect(1);
        this.plugin.return_results(next, this.connection,
            spf, 'mfrom', spf.NONE, 'test@example.com');
    },
    'result, neutral': function (test) {
        const next = function () {
            test.equal(undefined, arguments[0]);
            test.done();
        };
        test.expect(1);
        this.plugin.return_results(next, this.connection,
            spf, 'mfrom', spf.NEUTRAL, 'test@example.com');
    },
    'result, pass': function (test) {
        const next = function () {
            test.equal(undefined, arguments[0]);
            test.done();
        };
        test.expect(1);
        this.plugin.return_results(next, this.connection,
            spf, 'mfrom', spf.SPF_PASS, 'test@example.com');
    },
    'result, softfail, reject=false': function (test) {
        const next = function () {
            test.equal(undefined, arguments[0]);
            test.done();
        };
        test.expect(1);
        this.plugin.cfg.deny.mfrom_softfail=false;
        this.plugin.return_results(next, this.connection,
            spf, 'mfrom', spf.SPF_SOFTFAIL, 'test@example.com');
    },
    'result, softfail, reject=true': function (test) {
        const next = function () {
            test.equal(DENY, arguments[0]);
            test.done();
        };
        test.expect(1);
        this.plugin.cfg.deny.mfrom_softfail=true;
        this.plugin.return_results(next, this.connection, spf,
            'mfrom', spf.SPF_SOFTFAIL, 'test@example.com');
    },
    'result, fail, reject=false': function (test) {
        const next = function () {
            test.equal(undefined, arguments[0]);
            test.done();
        };
        test.expect(1);
        this.plugin.cfg.deny.mfrom_fail=false;
        this.plugin.return_results(next, this.connection, spf,
            'mfrom', spf.SPF_FAIL, 'test@example.com');
    },
    'result, fail, reject=true': function (test) {
        const next = function () {
            test.equal(DENY, arguments[0]);
            test.done();
        };
        test.expect(1);
        this.plugin.cfg.deny.mfrom_fail=true;
        this.plugin.return_results(next, this.connection, spf,
            'mfrom', spf.SPF_FAIL, 'test@example.com');
    },
    'result, temperror, reject=false': function (test) {
        const next = function () {
            test.equal(undefined, arguments[0]);
            test.done();
        };
        test.expect(1);
        this.plugin.cfg.defer.mfrom_temperror=false;
        this.plugin.return_results(next, this.connection, spf,
            'mfrom', spf.SPF_TEMPERROR, 'test@example.com');
    },
    'result, temperror, reject=true': function (test) {
        const next = function () {
            test.equal(DENYSOFT, arguments[0]);
            test.done();
        };
        test.expect(1);
        this.plugin.cfg.defer.mfrom_temperror=true;
        this.plugin.return_results(next, this.connection, spf,
            'mfrom', spf.SPF_TEMPERROR, 'test@example.com');
    },
    'result, permerror, reject=false': function (test) {
        const next = function () {
            test.equal(undefined, arguments[0]);
            test.done();
        };
        test.expect(1);
        this.plugin.cfg.deny.mfrom_permerror=false;
        this.plugin.return_results(next, this.connection, spf,
            'mfrom', spf.SPF_PERMERROR, 'test@example.com');
    },
    'result, permerror, reject=true': function (test) {
        const next = function () {
            test.equal(DENY, arguments[0]);
            test.done();
        };
        test.expect(1);
        this.plugin.cfg.deny.mfrom_permerror=true;
        this.plugin.return_results(next, this.connection, spf,
            'mfrom', spf.SPF_PERMERROR, 'test@example.com');
    },
    'result, unknown': function (test) {
        const next = function () {
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
        let completed = 0;
        const next = function (rc) {
            completed++;
            test.equal(undefined, rc);
            if (completed >= 2) test.done();
        };
        test.expect(2);
        this.connection.remote.is_private=true;
        this.plugin.hook_helo(next, this.connection);
        this.plugin.hook_helo(next, this.connection, 'helo.sender.com');
    },
    'IPv4 literal': function (test) {
        const next = function (rc) {
            test.equal(undefined, rc);
            test.done();
        };
        test.expect(1);
        this.connection.remote.ip='190.168.1.1';
        this.plugin.hook_helo(next, this.connection, '[190.168.1.1]' );
    },

};

const test_addr = new Address('<test@example.com>');

exports.hook_mail = {
    setUp : _set_up,
    'rfc1918': function (test) {
        const next = function () {
            test.equal(undefined, arguments[0]);
            test.done();
        };
        test.expect(1);
        this.connection.remote.is_private=true;
        this.connection.remote.ip='192.168.1.1';
        this.plugin.hook_mail(next, this.connection, [test_addr]);
    },
    'rfc1918 relaying': function (test) {
        const next = function () {
            test.equal(undefined, arguments[0]);
            test.done();
        };
        test.expect(1);
        this.connection.remote.is_private=true;
        this.connection.remote.ip='192.168.1.1';
        this.connection.relaying=true;
        this.plugin.hook_mail(next, this.connection, [test_addr]);
    },
    'no txn': function (test) {
        const next = function () {
            test.equal(undefined, arguments[0]);
            test.done();
        };
        test.expect(1);
        this.connection.remote.ip='207.85.1.1';
        delete this.connection.transaction;
        this.plugin.hook_mail(next, this.connection);
    },
    'txn, no helo': function (test) {
        const next = function () {
            test.equal(undefined, arguments[0]);
            test.done();
        };
        test.expect(1);
        this.plugin.cfg.deny.mfrom_fail = false;
        this.connection.remote.ip='207.85.1.1';
        this.plugin.hook_mail(next, this.connection, [test_addr]);
    },
    'txn': function (test) {
        const next = function (rc) {
            test.equal(undefined, rc);
            test.done();
        };
        test.expect(1);
        this.connection.set('remote', 'ip', '207.85.1.1');
        this.connection.set('hello', 'host', 'mail.example.com');
        this.plugin.hook_mail(next, this.connection, [test_addr]);
    },
    'txn, relaying': function (test) {
        const next = function (rc) {
            test.equal(undefined, rc);
            test.done();
        };
        test.expect(1);
        this.connection.set('remote', 'ip', '207.85.1.1');
        this.connection.relaying=true;
        this.connection.set('hello', 'host', 'mail.example.com');
        this.plugin.hook_mail(next, this.connection, [test_addr]);
    },
    'txn, relaying, is_private': function (test) {
        const next = function (rc) {
            test.equal(undefined, rc);
            test.done();
        };
        test.expect(1);
        this.plugin.cfg.relay.context='myself';
        this.plugin.cfg.deny_relay.mfrom_fail = true;
        this.connection.set('remote', 'ip', '127.0.1.1');
        this.connection.set('remote', 'is_private', true);
        this.connection.relaying = true;
        this.connection.set('hello', 'host', 'www.tnpi.net');
        this.plugin.nu.public_ip = '66.128.51.165';
        this.plugin.hook_mail(next, this.connection, [new Address('<nonexist@tnpi.net>')]);
    },
};

