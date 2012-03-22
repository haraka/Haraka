var stub             = require('../fixtures/stub'),
    constants        = require('../../constants'),
    Connection       = require('../fixtures/stub_connection'),
    Plugin           = require('../fixtures/stub_plugin');

// huge hack here, but plugin tests need constants
constants.import(global);

function _set_up(callback) {
    this.backup = {};

    // needed for tests
    this.plugin = Plugin('relay_all');
    this.connection = Connection.createConnection();
    this.params = ['foo@bar.com'];

    // stub out functions
    this.connection.loginfo = stub();

    // going to need these in multiple tests
    this.plugin.register();

    callback();
}

function _tear_down(callback) {
    callback();
}

exports.relay_all = {
    setUp : _set_up,
    tearDown : _tear_down,
    'should have register function' : function (test) {
        test.expect(2);
        test.isNotNull(this.plugin);
        test.isFunction(this.plugin.register);
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
        test.equals(this.plugin.register_hook.args[1], 'confirm_all');
        test.isNotNull(this.plugin.confirm_all);
        test.isFunction(this.plugin.confirm_all);
        test.done();
    },
    'confirm_all hook always returns OK' : function (test) {
        var next = function (action) {
            test.expect(1);
            test.equals(action, constants.ok);
            test.done();
        };

        this.plugin.confirm_all(next, this.connection, this.params);
    },
    'confirm_all hook always sets connection.relaying to 1' : function (test) {
        var next = function (action) {
            test.expect(1);
            test.equals(this.connection.relaying, 1);
            test.done();
        }.bind(this);

        this.plugin.confirm_all(next, this.connection, this.params);
    }
};
