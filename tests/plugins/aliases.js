'use strict';

var stub             = require('../fixtures/stub');
var Plugin           = require('../fixtures/stub_plugin');
var Connection       = require('../fixtures/stub_connection');
var Address          = require('../../address').Address;
var _                = require('lodash');

var _set_up = function (done) {

    // needed for tests
    this.plugin = new Plugin('aliases');
    this.recip  = new Address('<test1@example.com>');
    this.params = [this.recip];

    this.connection = Connection.createConnection();
    this.connection.loginfo = stub();
    this.connection.transaction = {
        notes: stub(),
        rcpt_to: [ this.params ],
    };

    // some test data
    this.configfile = {
        "test1" : { "action" : "drop" },
        "test2" : { "action" : "drop" },
        "test2-specific" : { "action" : "alias", "to" : "test2" },
        "test3" : { "action" : "alias", "to" : "test3-works" },
        "test4" : { "action" : "alias", "to" : "test4" },
        "test5" : { "action" : "alias", "to" : "test5-works@success.com" },
        "test6" : { "action" : "alias", "to" : "test6-works@success.com" },
        "test7" : { "action" : "fail",  "to" : "should_fail" },
        "test8" : { "to" : "should_fail" },
        "test9" : { "action" : "alias" }
    };

    this.plugin.config.get = function (file, type) {
        return this.configfile;
    }.bind(this);

    this.plugin.inherits = stub();

    // going to need these in multiple tests
    this.plugin.register();

    done();
};

exports.aliases = {
    setUp : _set_up,
    'should have register function' : function (test) {
        test.expect(2);
        if (!_.isNull(this.plugin)){ test.ok(true); }
        if (_.isFunction(this.plugin.register)){ test.ok(true); }
        test.done();
    },
    'register function should inherit from queue/discard' : function (test) {
        test.expect(2);
        test.ok(this.plugin.inherits.called);
        test.equals(this.plugin.inherits.args[0], 'queue/discard');
        test.done();
    },
    'register function should call register_hook()' : function (test) {
        test.expect(1);
        test.ok(this.plugin.register_hook.called);
        test.done();
    },
    'register_hook() should register for propper hook' : function (test) {
        test.expect(1);
        test.equals(this.plugin.register_hook.args[0], 'rcpt');
        test.done();
    },
    'register_hook() should register available function' : function (test) {
        test.expect(3);
        test.equals(this.plugin.register_hook.args[1], 'aliases');
        if (!_.isNull(this.plugin.aliases)){ test.ok(true); }
        if (_.isFunction(this.plugin.aliases)){ test.ok(true); }
        test.done();
    },
    'aliases hook always returns next()' : function (test) {
        var next = function (action) {
            test.expect(1);
            if (_.isUndefined(action)){ test.ok(true); }
            test.done();
        };

        this.plugin.aliases(next, this.connection, this.params);
    },
    'should drop test1@example.com' : function (test) {
        var next = function (action) {
            test.expect(1);
            test.ok(this.connection.transaction.notes.discard);
            test.done();
        }.bind(this);

        this.plugin.aliases(next, this.connection, this.params);
    },
    'should drop test2-testing@example.com' : function (test) {
        // these will get reset in _set_up everytime
        this.recip = new Address('<test2-testing@example.com>');
        this.params = [this.recip];

        var next = function (action) {
            test.expect(1);
            test.ok(this.connection.transaction.notes.discard);
            test.done();
        }.bind(this);

        this.plugin.aliases(next, this.connection, this.params);
    },
    'should drop test2-specific@example.com' : function (test) {
        // these will get reset in _set_up everytime
        this.recip = new Address('<test2-specific@example.com>');
        this.params = [this.recip];
        var result = new Address('<test2@example.com>');

        var next = function (action) {
            test.expect(4);
            if (_.isUndefined(this.connection.transaction.notes.discard)){ test.ok(true); }
            if (!_.isNull(this.connection.transaction.rcpt_to)){ test.ok(true); }
            if (_.isArray(this.connection.transaction.rcpt_to)){ test.ok(true); }
            test.deepEqual(this.connection.transaction.rcpt_to.pop(), result);
            test.done();
        }.bind(this);

        this.plugin.aliases(next, this.connection, this.params);
    },
    'should map test3@example.com to test3-works@example.com' : function (test) {
        // these will get reset in _set_up everytime
        this.recip = new Address('<test3@example.com>');
        this.params = [this.recip];
        var result = new Address('<test3-works@example.com>');

        var next = function (action) {
            test.expect(3);
            if (!_.isNull(this.connection.transaction.rcpt_to)){ test.ok(true); }
            if (_.isArray(this.connection.transaction.rcpt_to)){ test.ok(true); }
            test.deepEqual(this.connection.transaction.rcpt_to.pop(), result);
            test.done();
        }.bind(this);

        this.plugin.aliases(next, this.connection, this.params);
    },
    'should map test4-testing@example.com to test4@example.com' : function (test) {
        // these will get reset in _set_up everytime
        this.recip = new Address('<test4-testing@example.com>');
        this.params = [this.recip];
        var result = new Address('<test4@example.com>');

        var next = function (action) {
            test.expect(3);
            if (!_.isNull(this.connection.transaction.rcpt_to)){ test.ok(true); }
            if (_.isArray(this.connection.transaction.rcpt_to)){ test.ok(true); }
            test.deepEqual(this.connection.transaction.rcpt_to.pop(), result);
            test.done();
        }.bind(this);

        this.plugin.aliases(next, this.connection, this.params);
    },
    'should map test5@example.com to test5-works@success.com' : function (test) {
        // these will get reset in _set_up everytime
        this.recip = new Address('<test5@example.com>');
        this.params = [this.recip];
        var result = new Address('<test5-works@success.com>');

        var next = function (action) {
            test.expect(3);
            if (!_.isNull(this.connection.transaction.rcpt_to)){ test.ok(true); }
            if (_.isArray(this.connection.transaction.rcpt_to)){ test.ok(true); }
            test.deepEqual(this.connection.transaction.rcpt_to.pop(), result);
            test.done();
        }.bind(this);

        this.plugin.aliases(next, this.connection, this.params);
    },
    'should map test6-testing@example.com to test6-works@success.com' : function (test) {
        // these will get reset in _set_up everytime
        this.recip = new Address('<test6-testing@example.com>');
        this.params = [this.recip];
        var result = new Address('<test6-works@success.com>');

        var next = function (action) {
            test.expect(3);
            if (!_.isNull(this.connection.transaction.rcpt_to)){ test.ok(true); }
            if (_.isArray(this.connection.transaction.rcpt_to)){ test.ok(true); }
            test.deepEqual(this.connection.transaction.rcpt_to.pop(), result);
            test.done();
        }.bind(this);

        this.plugin.aliases(next, this.connection, this.params);
    },
    'should not drop test1@example.com, no config' : function (test) {
        // empty config data
        this.configfile = {};
        this.plugin.config.get = function (file, type) {
            return this.configfile;
        }.bind(this);

        var next = function (action) {
            test.expect(1);
            if (_.isUndefined(this.connection.transaction.notes.discard)){ test.ok(true); }
            test.done();
        }.bind(this);

        this.plugin.aliases(next, this.connection, this.params);
    },
    'should not drop test1@example.com, config undefined' : function (test) {
        // undefined config data
        this.configfile = undefined;
        this.plugin.config.get = function (file, type) {
            return this.configfile;
        }.bind(this);

        var next = function (action) {
            test.expect(1);
            if (_.isUndefined(this.connection.transaction.notes.discard)){ test.ok(true); }
            test.done();
        }.bind(this);

        this.plugin.aliases(next, this.connection, this.params);
    },
    'should fail with loginfo on unknown action' : function (test) {
        // these will get reset in _set_up everytime
        this.recip = new Address('<test7@example.com>');
        this.params = [this.recip];

        var next = function (action) {
            test.expect(2);
            test.ok(this.connection.loginfo.called);
            test.equals(this.connection.loginfo.args[1],
                "unknown action: " + this.configfile["test7"].action);
            test.done();
        }.bind(this);

        this.plugin.aliases(next, this.connection, this.params);
    },
    'should fail with loginfo on missing action' : function (test) {
        // these will get reset in _set_up everytime
        this.recip = new Address('<test8@example.com>');
        this.params = [this.recip];

        var next = function (action) {
            test.expect(2);
            test.ok(this.connection.loginfo.called);
            test.equals(this.connection.loginfo.args[1],
                "unknown action: <missing>");
            test.done();
        }.bind(this);

        this.plugin.aliases(next, this.connection, this.params);
    },
    'action alias should fail with loginfo on missing to' : function (test) {
        // these will get reset in _set_up everytime
        this.recip = new Address('<test9@example.com>');
        this.params = [this.recip];

        var next = function (action) {
            test.expect(2);
            test.ok(this.connection.loginfo.called);
            test.equals(this.connection.loginfo.args[1],
                'alias failed for test9, no "to" field in alias config');
            test.done();
        }.bind(this);

        this.plugin.aliases(next, this.connection, this.params);
    }
};
