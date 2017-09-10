'use strict';

const Address      = require('address-rfc2821').Address;
const fixtures     = require('haraka-test-fixtures');

const stub         = fixtures.stub.stub;
const Connection   = fixtures.connection;

const _set_up = function (done) {

    // needed for tests
    this.plugin = new fixtures.plugin('aliases');
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
        "test9" : { "action" : "alias" },
        "@example.co" : { "action" : "drop" },
        "test11@example.org" : { "action" : "drop" },
        "@demo.com" : { "action" : "alias", "to" : "test12-works@success.com" },
        "test13@example.net" : { "action" : "alias", "to" : "test13-works@success.com" },
        "test14@example.net" : { "action" : "alias", "to" : ["alice@success.com", "bob@success.com"] }
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
        test.ok(this.plugin);
        test.equal('function', typeof this.plugin.register);
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
        test.ok(this.plugin.aliases);
        test.equal('function', typeof this.plugin.aliases);
        test.done();
    },
    'aliases hook always returns next()' : function (test) {
        const next = function (action) {
            test.expect(1);
            test.equals(undefined, action);
            test.done();
        };

        this.plugin.aliases(next, this.connection, this.params);
    },
    'should drop test1@example.com' : function (test) {
        const next = function (action) {
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

        const next = function (action) {
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
        const result = new Address('<test2@example.com>');

        const next = function (action) {
            test.expect(4);
            test.equals(undefined, this.connection.transaction.notes.discard);
            test.ok(this.connection.transaction.rcpt_to);
            test.ok(Array.isArray(this.connection.transaction.rcpt_to));
            test.deepEqual(this.connection.transaction.rcpt_to.pop(), result);
            test.done();
        }.bind(this);

        this.plugin.aliases(next, this.connection, this.params);
    },
    'should map test3@example.com to test3-works@example.com' : function (test) {
        // these will get reset in _set_up everytime
        this.recip = new Address('<test3@example.com>');
        this.params = [this.recip];
        const result = new Address('<test3-works@example.com>');

        const next = function (action) {
            test.expect(3);
            test.ok(this.connection.transaction.rcpt_to);
            test.ok(Array.isArray(this.connection.transaction.rcpt_to));
            test.deepEqual(this.connection.transaction.rcpt_to.pop(), result);
            test.done();
        }.bind(this);

        this.plugin.aliases(next, this.connection, this.params);
    },
    'should map test4-testing@example.com to test4@example.com' : function (test) {
        // these will get reset in _set_up everytime
        this.recip = new Address('<test4-testing@example.com>');
        this.params = [this.recip];
        const result = new Address('<test4@example.com>');

        const next = function (action) {
            test.expect(3);
            test.ok(this.connection.transaction.rcpt_to);
            test.ok(Array.isArray(this.connection.transaction.rcpt_to));
            test.deepEqual(this.connection.transaction.rcpt_to.pop(), result);
            test.done();
        }.bind(this);

        this.plugin.aliases(next, this.connection, this.params);
    },
    'should map test4+testing@example.com to test4@example.com' : function (test) {
        // these will get reset in _set_up everytime
        this.recip = new Address('<test4+testing@example.com>');
        this.params = [this.recip];
        const result = new Address('<test4@example.com>');

        const next = function (action) {
            test.expect(3);
            test.ok(this.connection.transaction.rcpt_to);
            test.ok(Array.isArray(this.connection.transaction.rcpt_to));
            test.deepEqual(this.connection.transaction.rcpt_to.pop(), result);
            test.done();
        }.bind(this);

        this.plugin.aliases(next, this.connection, this.params);
    },
    'should map test5@example.com to test5-works@success.com' : function (test) {
        // these will get reset in _set_up everytime
        this.recip = new Address('<test5@example.com>');
        this.params = [this.recip];
        const result = new Address('<test5-works@success.com>');

        const next = function (action) {
            test.expect(3);
            test.ok(this.connection.transaction.rcpt_to);
            test.ok(Array.isArray(this.connection.transaction.rcpt_to));
            test.deepEqual(this.connection.transaction.rcpt_to.pop(), result);
            test.done();
        }.bind(this);

        this.plugin.aliases(next, this.connection, this.params);
    },
    'should map test6-testing@example.com to test6-works@success.com' : function (test) {
        // these will get reset in _set_up everytime
        this.recip = new Address('<test6-testing@example.com>');
        this.params = [this.recip];
        const result = new Address('<test6-works@success.com>');

        const next = function (action) {
            test.expect(3);
            test.ok(this.connection.transaction.rcpt_to);
            test.ok(Array.isArray(this.connection.transaction.rcpt_to));
            test.deepEqual(this.connection.transaction.rcpt_to.pop(), result);
            test.done();
        }.bind(this);

        this.plugin.aliases(next, this.connection, this.params);
    },
    'should drop @example.co' : function (test) {
        this.recip = new Address('<oc.elpmaxe@example.co>');
        this.params = [this.recip];

        const next = function (action) {
            test.expect(1);
            test.ok(this.connection.transaction.notes.discard);
            test.done();
        }.bind(this);

        this.plugin.aliases(next, this.connection, this.params);
    },
    'should drop test11@example.com' : function (test) {
        this.recip = new Address('<test11@example.org>');
        this.params = [this.recip];

        const next = function (action) {
            test.expect(1);
            test.ok(this.connection.transaction.notes.discard);
            test.done();
        }.bind(this);

        this.plugin.aliases(next, this.connection, this.params);
    },
    'should map @demo.com to test12-works@success.com' : function (test) {
        // these will get reset in _set_up everytime
        this.recip = new Address('<demo2014@demo.com>');
        this.params = [this.recip];
        const result = new Address('<test12-works@success.com>');

        const next = function (action) {
            test.expect(3);
            test.ok(this.connection.transaction.rcpt_to);
            test.ok(Array.isArray(this.connection.transaction.rcpt_to));
            test.deepEqual(this.connection.transaction.rcpt_to.pop(), result);
            test.done();
        }.bind(this);

        this.plugin.aliases(next, this.connection, this.params);
    },
    'should map test13@example.net to test13-works@success.com' : function (test) {
        // these will get reset in _set_up everytime
        this.recip = new Address('<test13@example.net>');
        this.params = [this.recip];
        const result = new Address('<test13-works@success.com>');

        const next = function (action) {
            test.expect(3);
            test.ok(this.connection.transaction.rcpt_to);
            test.ok(Array.isArray(this.connection.transaction.rcpt_to));
            test.deepEqual(this.connection.transaction.rcpt_to.pop(), result);
            test.done();
        }.bind(this);

        this.plugin.aliases(next, this.connection, this.params);
    },
    'should map test13+subaddress@example.net to test13-works@success.com' : function (test) {
        // these will get reset in _set_up everytime
        this.recip = new Address('<test13+subaddress@example.net>');
        this.params = [this.recip];
        const result = new Address('<test13-works@success.com>');

        const next = function (action) {
            test.expect(3);
            test.ok(this.connection.transaction.rcpt_to);
            test.ok(Array.isArray(this.connection.transaction.rcpt_to));
            test.deepEqual(this.connection.transaction.rcpt_to.pop(), result);
            test.done();
        }.bind(this);

        this.plugin.aliases(next, this.connection, this.params);
    },
    'should explode test14@example.net to alice@success.com and bob@success.com' : function (test) {
        // these will get reset in _set_up everytime
        this.recip = new Address('<test14@example.net>');
        this.params = [this.recip];
        const result = [new Address('<alice@success.com>'), new Address('<bob@success.com>')];

        const next = function (action) {
            test.expect(3);
            test.ok(this.connection.transaction.rcpt_to);
            test.ok(Array.isArray(this.connection.transaction.rcpt_to));
            test.deepEqual(this.connection.transaction.rcpt_to, result);
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

        const next = function (action) {
            test.expect(1);
            test.equals(undefined, this.connection.transaction.notes.discard);
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

        const next = function (action) {
            test.expect(1);
            test.equals(undefined, this.connection.transaction.notes.discard);
            test.done();
        }.bind(this);

        this.plugin.aliases(next, this.connection, this.params);
    },
    'should fail with loginfo on unknown action' : function (test) {
        // these will get reset in _set_up everytime
        this.recip = new Address('<test7@example.com>');
        this.params = [this.recip];

        const next = function (action) {
            test.expect(2);
            test.ok(this.connection.loginfo.called);
            test.equals(this.connection.loginfo.args[1],
                "unknown action: " + this.configfile.test7.action);
            test.done();
        }.bind(this);

        this.plugin.aliases(next, this.connection, this.params);
    },
    'should fail with loginfo on missing action' : function (test) {
        // these will get reset in _set_up everytime
        this.recip = new Address('<test8@example.com>');
        this.params = [this.recip];

        const next = function (action) {
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

        const next = function (action) {
            test.expect(2);
            test.ok(this.connection.loginfo.called);
            test.equals(this.connection.loginfo.args[1],
                'alias failed for test9, no "to" field in alias config');
            test.done();
        }.bind(this);

        this.plugin.aliases(next, this.connection, this.params);
    }
};
