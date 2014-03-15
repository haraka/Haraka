var stub         = require('../fixtures/stub'),
    Plugin       = require('../fixtures/stub_plugin'),
    Connection   = require('../fixtures/stub_connection'),
    constants    = require('../../constants'),
    Address      = require('../../address'),
    configfile   = require('../../configfile'),
    config       = require('../../config'),
    ResultStore  = require("../../result_store");

constants.import(global);

function _set_up(callback) {
    this.backup = {};

    // needed for tests
    this.plugin = Plugin('bounce');
    this.plugin.cfg = { 
        main: { 
            reject_invalid: true,
        },
        invalid_addrs: {
            'test@bad1.com': true,
            'test@bad2.com': true,
        }
    };

    this.plugin.logdebug = stub();
    this.plugin.logerror = stub();
    this.plugin.loginfo = stub();

    // stub out functions
    this.connection = Connection.createConnection();
    this.connection.results = new ResultStore(this.plugin);

    this.connection.loginfo = stub();
    this.connection.logerror = stub();

    // going to need these in multiple tests
    this.plugin.register();

    callback();
}

function _tear_down(callback) {
    callback();
}

exports.reject_invalid = {
    setUp : _set_up,
    tearDown : _tear_down,
    'valid': function (test) {
        test.expect(1);
        this.connection.transaction = { 
            mail_from: new Address.Address('<>'),
            rcpt_to: [ new Address.Address('test@good.com') ],
        };
        var cb = function () {
            test.equal(undefined, arguments[0]);
        };
        this.plugin.reject_invalid(cb, this.connection);
        test.done();
    },
    'invalid': function (test) {
        test.expect(1);
        this.connection.transaction = { 
            mail_from: new Address.Address('<>'),
            rcpt_to: [ 
                new Address.Address('test@good.com'),
                new Address.Address('test2@good.com') 
            ],
        };
        var cb = function () {
            test.equal(DENY, arguments[0]);
        };
        this.plugin.reject_invalid(cb, this.connection);
        test.done();
    },
};

exports.bad_bounce_to = {
    setUp : _set_up,
    tearDown : _tear_down,
    'test@good.com': function (test) {
        test.expect(1);
        this.connection.transaction = { 
            mail_from: new Address.Address('<>'),
            rcpt_to: [ new Address.Address('test@good.com') ],
        };
        var cb = function () {
            test.equal(undefined, arguments[0]);
        };
        this.plugin.bad_bounce_to(cb, this.connection);
        test.done();
    },
    'test@bad1.com': function (test) {
        test.expect(1);
        this.connection.transaction = { 
            mail_from: new Address.Address('<>'),
            rcpt_to: [ new Address.Address('test@bad1.com') ],
        };
        var cb = function () {
            test.equal(DENY, arguments[0]);
        };
        this.plugin.bad_bounce_to(cb, this.connection);
        test.done();
    },
    'test@bad1.com, test@bad2.com': function (test) {
        test.expect(1);
        this.connection.transaction = { 
            mail_from: new Address.Address('<>'),
            rcpt_to: [ 
                new Address.Address('test@bad1.com'),
                new Address.Address('test@bad2.com') 
                ],
        };
        var cb = function () {
            test.equal(DENY, arguments[0]);
        };
        this.plugin.bad_bounce_to(cb, this.connection);
        test.done();
    },
    'test@good.com, test@bad2.com': function (test) {
        test.expect(1);
        this.connection.transaction = { 
            mail_from: new Address.Address('<>'),
            rcpt_to: [ 
                new Address.Address('test@good.com'),
                new Address.Address('test@bad2.com') 
                ],
        };
        var cb = function () {
            test.equal(DENY, arguments[0]);
        };
        this.plugin.bad_bounce_to(cb, this.connection);
        test.done();
    },
};

exports.multiple_recipients = {
    setUp : _set_up,
    tearDown : _tear_down,
    'test@example.com': function (test) {
        test.expect(1);
        this.connection.transaction = { rcpt_to: [ new Address.Address('test@example.com') ] };
        test.equal(false, this.plugin.multiple_recipients(this.connection));
        test.done();
    },
    'test@example.com,test2@example.com': function (test) {
        test.expect(1);
        this.connection.transaction = { rcpt_to: [
            new Address.Address('test1@example.com'),  
            new Address.Address('test2@example.com'),  
            ] };
        test.ok(this.plugin.multiple_recipients(this.connection));
        test.done();
    },
};

exports.has_null_sender = {
    setUp : _set_up,
    tearDown : _tear_down,
    '<>': function (test) {
        test.expect(1);
        this.connection.transaction = { mail_from: new Address.Address('<>') };
        test.equal(true, this.plugin.has_null_sender(this.connection));
        test.done();
    },
    ' ': function (test) {
        test.expect(1);
        this.connection.transaction = { mail_from: new Address.Address('') };
        test.equal(true, this.plugin.has_null_sender(this.connection));
        test.done();
    },
    'user@example': function (test) {
        test.expect(1);
        this.connection.transaction = { mail_from: new Address.Address('user@example') };
        test.equal(false, this.plugin.has_null_sender(this.connection));
        test.done();
    },
    'user@example.com': function (test) {
        test.expect(1);
        this.connection.transaction = { mail_from: new Address.Address('user@example.com') };
        test.equal(false, this.plugin.has_null_sender(this.connection));
        test.done();
    },
};
