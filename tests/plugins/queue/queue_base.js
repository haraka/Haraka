var stub             = require('tests/fixtures/stub'),
    constants        = require('../../../constants'),
    Connection       = require('tests/fixtures/stub_connection'),
    Plugin           = require('tests/fixtures/stub_plugin');

// huge hack here, but plugin tests need constants
constants.import(global);

function _set_up(callback) {
    this.backup = {};

    // needed for tests
    this.plugin = Plugin.createPlugin('plugins/queue/queue_base');
    this.connection = Connection.createConnection();

    // backup modifications

    // stub out functions
    this.connection.logdebug = stub();
    this.next = stub();

    // going to need these in multiple tests

    callback();
}

function _tear_down(callback) {
    // restore backed up functions

    callback();
}

exports.queue_base = {
    setUp : _set_up,
    tearDown : _tear_down,
    'should have get_conn function' : function (test) {
        test.expect(2);
        test.isNotNull(this.plugin);
        test.isFunction(this.plugin.get_conn);
        test.done();
    },
    'should throw with missing argument 0' : function (test) {
        test.expect(2);

        try {
            this.plugin.get_conn(null, this.next, this.connection,
                'localhost', 25, 0);
        }
        catch (err) {
            test.isNotNull(err);
            test.equals(err.message, "Invalid Arguments");
        }

        test.done();
    },
    'should throw with missing argument 1' : function (test) {
        test.expect(2);

        try {
            this.plugin.get_conn(this, null, this.connection,
                'localhost', 25, 0);
        }
        catch (err) {
            test.isNotNull(err);
            test.equals(err.message, "Invalid Arguments");
        }

        test.done();
    },
    'should throw with missing argument 2' : function (test) {
        test.expect(2);

        try {
            this.plugin.get_conn(this, this.next, null,
                'localhost', 25, 0);
        }
        catch (err) {
            test.isNotNull(err);
            test.equals(err.message, "Invalid Arguments");
        }

        test.done();
    }
};
