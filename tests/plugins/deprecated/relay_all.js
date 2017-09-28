'use strict';

const fixtures     = require('haraka-test-fixtures');

const _set_up = function (callback) {

    this.plugin = new fixtures.plugin('relay_all');
    this.connection = fixtures.connection.createConnection();
    this.params = ['foo@bar.com'];

    this.plugin.register();

    callback();
};

exports.relay_all = {
    setUp : _set_up,
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
        const next = function (action) {
            test.expect(1);
            test.equals(action, OK);
            test.done();
        };

        this.plugin.confirm_all(next, this.connection, this.params);
    },
    'confirm_all hook always sets connection.relaying to 1' : function (test) {
        const next = function (action) {
            test.expect(1);
            test.equals(this.connection.relaying, 1);
            test.done();
        }.bind(this);

        this.plugin.confirm_all(next, this.connection, this.params);
    }
};
