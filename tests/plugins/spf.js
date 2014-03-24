var stub         = require('../fixtures/stub'),
    constants    = require('../../constants'),
    Connection   = require('../fixtures/stub_connection'),
    Plugin       = require('../fixtures/stub_plugin'),
    SPF          = require('../../spf').SPF,
    configfile   = require('../../configfile'),
    config       = require('../../config'),
    ResultStore  = require("../../result_store"),
    Address      = require('../../address').Address;

constants.import(global);
var spf = new SPF();

function _set_up(callback) {
    this.backup = {};

    // needed for tests
    this.plugin = Plugin('spf');
    this.plugin.config = config;
    this.plugin.cfg = { main: { } };

    this.connection = Connection.createConnection();
    this.connection.results = new ResultStore(this.plugin);

    callback();
}
function _tear_down(callback) {
    callback();
}

exports.return_results = {
    setUp : _set_up,
    tearDown : _tear_down,
    'result, none': function (test) {
        var next = function () {
            test.equal(undefined, arguments[0]);
            test.done();
        };
        test.expect(1);
        this.plugin.return_results(next, this.connection, spf, 'mfrom', spf.NONE, 'test@example.com');
    },
    'result, neutral': function (test) {
        var next = function () {
            test.equal(undefined, arguments[0]);
            test.done();
        };
        test.expect(1);
        this.plugin.return_results(next, this.connection, spf, 'mfrom', spf.NEUTRAL, 'test@example.com');
    },
    'result, pass': function (test) {
        var next = function () {
            test.equal(undefined, arguments[0]);
            test.done();
        };
        test.expect(1);
        this.plugin.return_results(next, this.connection, spf, 'mfrom', spf.SPF_PASS, 'test@example.com');
    },
    'result, softfail, reject=false': function (test) {
        var next = function () {
            test.equal(undefined, arguments[0]);
            test.done();
        };
        test.expect(1);
        this.plugin.cfg.main.mfrom_softfail_reject=false;
        this.plugin.return_results(next, this.connection, spf, 'mfrom', spf.SPF_SOFTFAIL, 'test@example.com');
    },
    'result, softfail, reject=true': function (test) {
        var next = function () {
            test.equal(DENY, arguments[0]);
            test.done();
        };
        test.expect(1);
        this.plugin.cfg.main.mfrom_softfail_reject=true;
        this.plugin.return_results(next, this.connection, spf, 'mfrom', spf.SPF_SOFTFAIL, 'test@example.com');
    },
    'result, fail, reject=false': function (test) {
        var next = function () {
            test.equal(undefined, arguments[0]);
            test.done();
        };
        test.expect(1);
        this.plugin.cfg.main.mfrom_fail_reject=false;
        this.plugin.return_results(next, this.connection, spf, 'mfrom', spf.SPF_FAIL, 'test@example.com');
    },
    'result, fail, reject=true': function (test) {
        var next = function () {
            test.equal(DENY, arguments[0]);
            test.done();
        };
        test.expect(1);
        this.plugin.cfg.main.mfrom_fail_reject=true;
        this.plugin.return_results(next, this.connection, spf, 'mfrom', spf.SPF_FAIL, 'test@example.com');
    },
    'result, temperror, reject=false': function (test) {
        var next = function () {
            test.equal(undefined, arguments[0]);
            test.done();
        };
        test.expect(1);
        this.plugin.cfg.main.mfrom_temperror_defer=false;
        this.plugin.return_results(next, this.connection, spf, 'mfrom', spf.SPF_TEMPERROR, 'test@example.com');
    },
    'result, temperror, reject=true': function (test) {
        var next = function () {
            test.equal(DENYSOFT, arguments[0]);
            test.done();
        };
        test.expect(1);
        this.plugin.cfg.main.mfrom_temperror_defer=true;
        this.plugin.return_results(next, this.connection, spf, 'mfrom', spf.SPF_TEMPERROR, 'test@example.com');
    },
    'result, permerror, reject=false': function (test) {
        var next = function () {
            test.equal(undefined, arguments[0]);
            test.done();
        };
        test.expect(1);
        this.plugin.cfg.main.mfrom_permerror_reject=false;
        this.plugin.return_results(next, this.connection, spf, 'mfrom', spf.SPF_PERMERROR, 'test@example.com');
    },
    'result, permerror, reject=true': function (test) {
        var next = function () {
            test.equal(DENY, arguments[0]);
            test.done();
        };
        test.expect(1);
        this.plugin.cfg.main.mfrom_permerror_reject=true;
        this.plugin.return_results(next, this.connection, spf, 'mfrom', spf.SPF_PERMERROR, 'test@example.com');
    },
    'result, unknown': function (test) {
        var next = function () {
            test.equal(undefined, arguments[0]);
            test.done();
        };
        test.expect(1);
        this.plugin.return_results(next, this.connection, spf, 'mfrom', 'unknown', 'test@example.com');
    },
};

exports.hook_mail = {
    setUp : _set_up,
    tearDown : _tear_down,
    'rfc1918': function (test) {
        var next = function () {
            test.equal(undefined, arguments[0]);
            test.done();
        };
        test.expect(1);
        this.connection.remote_ip='192.168.1.1';
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
        this.plugin.hook_mail(next, this.connection, [new Address('<test@example.com>')]);
    },
    'txn, no helo': function (test) {
        var next = function () {
            test.equal(undefined, arguments[0]);
            test.done();
        };
        test.expect(1);
        this.connection.remote_ip='207.85.1.1';
        this.connection.hello_host = 'mail.example.com';
        this.plugin.hook_mail(next, this.connection, [new Address('<test@example.com>')]);
    },
};
