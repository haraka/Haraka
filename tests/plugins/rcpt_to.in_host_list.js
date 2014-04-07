
var stub             = require('../fixtures/stub'),
    Plugin           = require('../fixtures/stub_plugin'),
    Connection       = require('../fixtures/stub_connection'),
    constants        = require('../../constants'),
    Address          = require('../../address').Address,
    configfile       = require('../../configfile'),
    config           = require('../../config'),
    ResultStore      = require('../../result_store');

// huge hack here, but plugin tests need constants
constants.import(global);

function _set_up(callback) {
    this.backup = {};

    // needed for tests
    this.plugin = Plugin('rcpt_to.in_host_list');
    this.plugin.cfg = {};
    this.connection = Connection.createConnection();
    this.connection.transaction = {
        results: new ResultStore(this.connection),
    };

    callback();
}

function _tear_down(callback) {
    callback();
}

exports.hook_mail = {
    setUp : _set_up,
    tearDown : _tear_down,
    'relaying=false' : function (test) {
        test.expect(2);
        var next = function (rc, msg) {
            test.equal(undefined, rc);
            test.equal(undefined, msg);
            test.done();
        };
        this.plugin.hook_mail(next, this.connection, [new Address('test@test.com')]);
    },
    'relaying=true, null sender' : function (test) {
        test.expect(2);
        var next = function (rc, msg) {
            test.equal(undefined, rc);
            test.equal(undefined, msg);
            test.done();
        };
        this.connection.relaying=true;
        this.plugin.hook_mail(next, this.connection, [new Address('<>')]);
    },
    'relaying=true, not in_list' : function (test) {
        test.expect(2);
        var next = function (rc, msg) {
            // console.log(this.connection.transaction.results.get('rcpt_to.in_host_list'));
            test.equal(DENY, rc);
            test.ok(msg);
            test.done();
        }.bind(this);
        this.connection.relaying=true;
        this.plugin.cfg.host_list = ['miss.com'];
        this.plugin.hook_mail(next, this.connection, [new Address('<user@example.com>')]);
    },
    'relaying=true, in_list' : function (test) {
        test.expect(2);
        var next = function (rc, msg) {
            test.equal(undefined, rc);
            test.equal(undefined, msg);
            test.done();
        };
        this.connection.relaying=true;
        this.plugin.cfg.host_list = ['example.com'];
        this.plugin.hook_mail(next, this.connection, [new Address('<user@example.com>')]);
    },
    'relaying=true, in_regex' : function (test) {
        test.expect(2);
        var next = function (rc, msg) {
            test.equal(undefined, rc);
            test.equal(undefined, msg);
            test.done();
        };
        this.connection.relaying=true;
        this.plugin.cfg.regex = new RegExp ('^(?:example.com|test.com)$', 'i');
        this.plugin.hook_mail(next, this.connection, [new Address('<user@example.com>')]);
    },
};

exports.hook_rcpt = {
    setUp : _set_up,
    tearDown : _tear_down,
    'relaying=true' : function (test) {
        test.expect(2);
        var next = function (rc, msg) {
            test.equal(undefined, rc);
            test.equal(undefined, msg);
            test.done();
        };
        this.connection.relaying=true;
        this.plugin.hook_rcpt(next, this.connection, [new Address('test@test.com')]);
    },
    'relaying=false, not in_list' : function (test) {
        test.expect(2);
        var next = function (rc, msg) {
            // console.log(this.connection.transaction.results.get('rcpt_to.in_host_list'));
            test.equal(undefined, rc);
            test.equal(undefined, msg);
            test.done();
        }.bind(this);
        this.plugin.cfg.host_list = ['miss.com'];
        this.plugin.hook_rcpt(next, this.connection, [new Address('<user@example.com>')]);
    },
    'relaying=false, in_list' : function (test) {
        test.expect(2);
        var next = function (rc, msg) {
            test.equal(OK, rc);
            test.equal(undefined, msg);
            test.done();
        };
        this.plugin.cfg.host_list = ['example.com'];
        this.plugin.hook_rcpt(next, this.connection, [new Address('<user@example.com>')]);
    },
    'relaying=false, in_regex' : function (test) {
        test.expect(2);
        var next = function (rc, msg) {
            test.equal(OK, rc);
            test.equal(undefined, msg);
            test.done();
        };
        this.plugin.cfg.regex = new RegExp ('^(?:example.com|test.com)$', 'i');
        this.plugin.hook_rcpt(next, this.connection, [new Address('<user@example.com>')]);
    },
};
