
var stub         = require('../fixtures/stub'),
    Plugin       = require('../fixtures/stub_plugin'),
    configfile   = require('../../configfile'),
    config       = require('../../config'),
    Address      = require('../../address'),
    Connection   = require('../fixtures/stub_connection'),
    ResultStore  = require("../../result_store");

function _set_up(callback) {
    this.backup = {};

    // needed for tests
    this.plugin = Plugin('dkim_sign');
    this.plugin.config = config;
    this.plugin.cfg = { main: { } };

    this.connection = Connection.createConnection();
    this.connection.results = new ResultStore(this.plugin);

    callback();
}

function _tear_down(callback) {
    callback();
}

exports.get_key_dir = {
    setUp : _set_up,
    tearDown : _tear_down,
    'no transaction': function (test) {
        test.expect(1);
        var cb = function (dir) {
            test.equal(undefined, dir);
            test.done();
        };
        this.plugin.get_key_dir(this.connection, cb);
    },
    'no key dir': function (test) {
        test.expect(1);
        var cb = function (dir) {
            test.equal(undefined, dir);
            test.done();
        };
        this.connection.transaction = { 
            mail_from: new Address.Address('<matt@example.com>'),
        };
        this.plugin.get_key_dir(this.connection, cb);
    },
};

exports.get_headers_to_sign = {
    setUp : _set_up,
    tearDown : _tear_down,
    'none': function (test) {
        test.expect(1);
        var r = this.plugin.get_headers_to_sign(this.plugin.cfg);
        test.deepEqual(r, []);
        test.done();
    },
    'from, subject': function (test) {
        test.expect(1);
        this.plugin.cfg.main.headers_to_sign='from,subject';
        var r = this.plugin.get_headers_to_sign(this.plugin.cfg);
        test.deepEqual(r, ['from','subject']);
        test.done();
    },
    'missing from': function (test) {
        test.expect(1);
        this.plugin.cfg.main.headers_to_sign='subject';
        var r = this.plugin.get_headers_to_sign(this.plugin.cfg);
        test.deepEqual(r, ['subject', 'from']);
        test.done();
    },
};
