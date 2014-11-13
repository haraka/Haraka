var stub             = require('../fixtures/stub'),
    Address          = require('../../address').Address,
    Connection       = require('../fixtures/stub_connection'),
    Plugin           = require('../fixtures/stub_plugin');

function _set_up(callback) {
    this.backup = {};

    // needed for tests
    this.plugin = new Plugin('aliases');
    this.connection = Connection.createConnection();
    this.recip = new Address('<test1@example.com>');
    this.params = [this.recip];

    // stub out functions
    this.connection.loginfo = stub();
    this.connection.logdebug = stub();
    this.connection.notes = stub();
    this.connection.transaction = stub();
    this.connection.transaction.notes = stub();
    this.connection.transaction.rcpt_to = [ this.params ];

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

    callback();
}

function _tear_down(callback) {
    callback();
}

exports.aliases = {
    setUp : _set_up,
    tearDown : _tear_down,
    'should have register function' : function (test) {
        test.expect(2);
        test.isNotNull(this.plugin);
        test.isFunction(this.plugin.register);
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
        test.isNotNull(this.plugin.aliases);
        test.isFunction(this.plugin.aliases);
        test.done();
    },
    'aliases hook always returns next()' : function (test) {
        var next = function (action) {
            test.expect(1);
            test.isUndefined(action);
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
            test.isUndefined(this.connection.transaction.notes.discard);
            test.isNotNull(this.connection.transaction.rcpt_to);
            test.isArray(this.connection.transaction.rcpt_to);
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
            test.isNotNull(this.connection.transaction.rcpt_to);
            test.isArray(this.connection.transaction.rcpt_to);
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
            test.isNotNull(this.connection.transaction.rcpt_to);
            test.isArray(this.connection.transaction.rcpt_to);
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
            test.isNotNull(this.connection.transaction.rcpt_to);
            test.isArray(this.connection.transaction.rcpt_to);
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
            test.isNotNull(this.connection.transaction.rcpt_to);
            test.isArray(this.connection.transaction.rcpt_to);
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
            test.isUndefined(this.connection.transaction.notes.discard);
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
            test.isUndefined(this.connection.transaction.notes.discard);
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
