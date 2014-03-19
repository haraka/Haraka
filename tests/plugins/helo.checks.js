var stub         = require('../fixtures/stub'),
    Plugin       = require('../fixtures/stub_plugin'),
    Connection   = require('../fixtures/stub_connection'),
    constants    = require('../../constants'),
    configfile   = require('../../configfile'),
    config       = require('../../config'),
    Address      = require('../../address');

constants.import(global);

function _set_up(callback) {
    this.backup = {};

    // needed for tests
    this.plugin = Plugin('helo.checks');
    this.plugin.config = config;

    this.connection = Connection.createConnection();

    this.plugin.hook_connect(stub, this.connection);

    // going to need these in multiple tests
    // this.plugin.register();

    callback();
}

function _tear_down(callback) {
    callback();
}

exports.mismatch = {
    setUp : _set_up,
    tearDown : _tear_down,
    'stub' : function (test) {
        test.expect(1);
        var cb = function () {
            test.equal(undefined, arguments[0]);
        };
        console.log(this.plugin);
        this.plugin.mismatch(cb, this.connection);
        test.done();
    },
};

exports.no_dot = {
    setUp : _set_up,
    tearDown : _tear_down,
};

