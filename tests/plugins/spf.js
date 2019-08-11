'use strict';

const Address      = require('address-rfc2821').Address;
const fixtures     = require('haraka-test-fixtures');
const constants    = require('haraka-constants');

const SPF          = require('../../spf').SPF;
const spf          = new SPF();

const _set_up = function (done) {

    this.plugin = new fixtures.plugin('spf');
    this.plugin.timeout = 8000;
    this.plugin.load_spf_ini();

    // uncomment this line to see detailed SPF evaluation
    this.plugin.SPF.prototype.log_debug = () => {};

    this.connection = fixtures.connection.createConnection();
    this.connection.transaction = fixtures.transaction.createTransaction();
    this.connection.transaction.results = new fixtures.results(this.connection);

    done();
}

exports.return_results = {
    setUp : _set_up,
    'result, none, reject=false' (test) {
        function next () {
            test.equal(undefined, arguments[0]);
            test.done();
        }
        test.expect(1);
        this.plugin.cfg.deny.mfrom_none=false;
        this.plugin.return_results(next, this.connection, spf, 'mfrom', spf.SPF_NONE, 'test@example.com');
    },
    'result, none, reject=true' (test) {
        function next () {
            test.equal(DENY, arguments[0]);
            test.done();
        }
        test.expect(1);
        this.plugin.cfg.deny.mfrom_none=true;
        this.plugin.return_results(next, this.connection, spf, 'mfrom', spf.SPF_NONE, 'test@example.com');
    },
    'result, neutral' (test) {
        function next () {
            test.equal(undefined, arguments[0]);
            test.done();
        }
        test.expect(1);
        this.plugin.return_results(next, this.connection, spf, 'mfrom', spf.SPF_NEUTRAL, 'test@example.com');
    },
    'result, pass' (test) {
        function next () {
            test.equal(undefined, arguments[0]);
            test.done();
        }
        test.expect(1);
        this.plugin.return_results(next, this.connection, spf, 'mfrom', spf.SPF_PASS, 'test@example.com');
    },
    'result, softfail, reject=false' (test) {
        function next () {
            test.equal(undefined, arguments[0]);
            test.done();
        }
        test.expect(1);
        this.plugin.cfg.deny.mfrom_softfail=false;
        this.plugin.return_results(next, this.connection, spf, 'mfrom', spf.SPF_SOFTFAIL, 'test@example.com');
    },
    'result, softfail, reject=true' (test) {
        function next () {
            test.equal(DENY, arguments[0]);
            test.done();
        }
        test.expect(1);
        this.plugin.cfg.deny.mfrom_softfail=true;
        this.plugin.return_results(next, this.connection, spf, 'mfrom', spf.SPF_SOFTFAIL, 'test@example.com');
    },
    'result, fail, reject=false' (test) {
        function next () {
            test.equal(undefined, arguments[0]);
            test.done();
        }
        test.expect(1);
        this.plugin.cfg.deny.mfrom_fail=false;
        this.plugin.return_results(next, this.connection, spf, 'mfrom', spf.SPF_FAIL, 'test@example.com');
    },
    'result, fail, reject=true' (test) {
        function next () {
            test.equal(DENY, arguments[0]);
            test.done();
        }
        test.expect(1);
        this.plugin.cfg.deny.mfrom_fail=true;
        this.plugin.return_results(next, this.connection, spf, 'mfrom', spf.SPF_FAIL, 'test@example.com');
    },
    'result, temperror, reject=false' (test) {
        function next () {
            test.equal(undefined, arguments[0]);
            test.done();
        }
        test.expect(1);
        this.plugin.cfg.defer.mfrom_temperror=false;
        this.plugin.return_results(next, this.connection, spf, 'mfrom', spf.SPF_TEMPERROR, 'test@example.com');
    },
    'result, temperror, reject=true' (test) {
        function next () {
            test.equal(DENYSOFT, arguments[0]);
            test.done();
        }
        test.expect(1);
        this.plugin.cfg.defer.mfrom_temperror=true;
        this.plugin.return_results(next, this.connection, spf, 'mfrom', spf.SPF_TEMPERROR, 'test@example.com');
    },
    'result, permerror, reject=false' (test) {
        function next () {
            test.equal(undefined, arguments[0]);
            test.done();
        }
        test.expect(1);
        this.plugin.cfg.deny.mfrom_permerror=false;
        this.plugin.return_results(next, this.connection, spf, 'mfrom', spf.SPF_PERMERROR, 'test@example.com');
    },
    'result, permerror, reject=true' (test) {
        function next () {
            test.equal(DENY, arguments[0]);
            test.done();
        }
        test.expect(1);
        this.plugin.cfg.deny.mfrom_permerror=true;
        this.plugin.return_results(next, this.connection, spf, 'mfrom', spf.SPF_PERMERROR, 'test@example.com');
    },
    'result, unknown' (test) {
        function next () {
            test.equal(undefined, arguments[0]);
            test.done();
        }
        test.expect(1);
        this.plugin.return_results(next, this.connection, spf, 'mfrom', 'unknown', 'test@example.com');
    },
}

exports.hook_helo = {
    setUp : _set_up,
    'rfc1918' (test) {
        let completed = 0;
        function next (rc) {
            completed++;
            test.equal(undefined, rc);
            if (completed >= 2) test.done();
        }
        test.expect(2);
        this.connection.remote.is_private=true;
        this.plugin.helo_spf(next, this.connection);
        this.plugin.helo_spf(next, this.connection, 'helo.sender.com');
    },
    'IPv4 literal' (test) {
        function next (rc) {
            test.equal(undefined, rc);
            test.done();
        }
        test.expect(1);
        this.connection.remote.ip='190.168.1.1';
        this.plugin.helo_spf(next, this.connection, '[190.168.1.1]' );
    },

}

const test_addr = new Address('<test@example.com>');

exports.hook_mail = {
    setUp : _set_up,
    'rfc1918' (test) {
        function next () {
            test.equal(undefined, arguments[0]);
            test.done();
        }
        test.expect(1);
        this.connection.remote.is_private=true;
        this.connection.remote.ip='192.168.1.1';
        this.plugin.hook_mail(next, this.connection, [test_addr]);
    },
    'rfc1918 relaying' (test) {
        function next () {
            test.ok([undefined, constants.CONT].includes(arguments[0]));
            test.done();
        }
        test.expect(1);
        this.connection.set('remote.is_private', true);
        this.connection.set('remote.ip','192.168.1.1');
        this.connection.relaying=true;
        this.plugin.hook_mail(next, this.connection, [test_addr]);
    },
    'no txn' (test) {
        function next () {
            test.equal(undefined, arguments[0]);
            test.done();
        }
        test.expect(1);
        this.connection.remote.ip='207.85.1.1';
        delete this.connection.transaction;
        this.plugin.hook_mail(next, this.connection);
    },
    'txn, no helo' (test) {
        function next () {
            test.equal(undefined, arguments[0]);
            test.done();
        }
        test.expect(1);
        this.plugin.cfg.deny.mfrom_fail = false;
        this.connection.remote.ip='207.85.1.1';
        this.plugin.hook_mail(next, this.connection, [test_addr]);
    },
    'txn' (test) {
        function next (rc) {
            test.equal(undefined, rc);
            test.done();
        }
        test.expect(1);
        this.connection.set('remote', 'ip', '207.85.1.1');
        this.connection.set('hello', 'host', 'mail.example.com');
        this.plugin.hook_mail(next, this.connection, [test_addr]);
    },
    'txn, relaying' (test) {
        function next (rc) {
            test.equal(undefined, rc);
            test.done();
        }
        test.expect(1);
        this.connection.set('remote.ip', '207.85.1.1');
        this.connection.relaying=true;
        this.connection.set('hello.host', 'mail.example.com');
        this.plugin.hook_mail(next, this.connection, [test_addr]);
    },
    'txn, relaying, is_private' (test) {
        function next (rc) {
            test.equal(undefined, rc);
            test.done();
        }
        test.expect(1);
        this.plugin.cfg.relay.context='myself';
        this.plugin.cfg.deny_relay.mfrom_fail = true;
        this.connection.set('remote.ip', '127.0.1.1');
        this.connection.set('remote.is_private', true);
        this.connection.relaying = true;
        this.connection.set('hello.host', 'www.tnpi.net');
        this.plugin.nu.public_ip = '66.128.51.165';
        this.plugin.hook_mail(next, this.connection, [new Address('<nonexist@tnpi.net>')]);
    },
}
