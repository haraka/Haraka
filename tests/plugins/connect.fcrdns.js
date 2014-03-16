var stub         = require('../fixtures/stub'),
    Plugin       = require('../fixtures/stub_plugin'),
    Connection   = require('../fixtures/stub_connection'),
    constants    = require('../../constants'),
    configfile   = require('../../configfile'),
    config       = require('../../config'),
    ResultStore  = require('../../result_store'),
    dns          = require('dns');

constants.import(global);

function _set_up(callback) {
    this.backup = {};

    // needed for tests
    this.plugin = Plugin('connect.fcrdns');
    this.plugin.config = config;
    this.plugin.loginfo = stub();
    this.plugin.logerror = stub();

    this.connection = Connection.createConnection();
    this.connection.results = new ResultStore(this.plugin);
    this.connection.notes = {};

    callback();
}

function _tear_down(callback) {
    callback();
}

exports.refresh_config = {
    setUp : _set_up,
    tearDown : _tear_down,
    'none': function (test) {
        test.expect(1);
        test.equal(undefined, this.plugin.cfg);
        test.done();
    },
    'defaults return': function (test) {
        test.expect(4);
        var r = this.plugin.refresh_config(this.connection);
        test.equal(0, r.reject.no_rdns);
        test.equal(0, r.reject.no_fcrdns);
        test.equal(0, r.reject.invalid_tld);
        test.equal(0, r.reject.generic_rdns);
        test.done();
    },
    'defaults cfg': function (test) {
        test.expect(4);
        this.plugin.refresh_config(this.connection);
        test.equal(0, this.plugin.cfg.reject.no_rdns);
        test.equal(0, this.plugin.cfg.reject.no_fcrdns);
        test.equal(0, this.plugin.cfg.reject.invalid_tld);
        test.equal(0, this.plugin.cfg.reject.generic_rdns);
        test.done();
    },
};

exports.handle_ptr_error = {
    setUp : _set_up,
    tearDown : _tear_down,
    'ENOTFOUND reject.no_rdns=0': function (test) {
        test.expect(1);
        this.plugin.refresh_config(this.connection);
        var err = new Error("test error");
        err.code = 'ENOTFOUND';
        var cb = function () {
            test.equal(undefined, arguments[0]);
        };
        this.plugin.handle_ptr_error(this.connection, err, cb);
        test.done();
    },
    'ENOTFOUND reject.no_rdns=1': function (test) {
        test.expect(1);
        this.plugin.refresh_config(this.connection);
        var err = new Error("test error");
        err.code = 'ENOTFOUND';
        this.plugin.cfg.reject.no_rdns=1;
        var cb = function () {
            test.equal(DENY, arguments[0]);
        };
        this.plugin.handle_ptr_error(this.connection, err, cb);
        test.done();
    },
    'dns.NOTFOUND reject.no_rdns=0': function (test) {
        test.expect(1);
        this.plugin.refresh_config(this.connection);
        var err = new Error("test error");
        err.code = dns.NOTFOUND;
        this.plugin.cfg.reject.no_rdns=0;
        var cb = function () {
            test.equal(undefined, arguments[0]);
        };
        this.plugin.handle_ptr_error(this.connection, err, cb);
        test.done();
    },
    'dns.NOTFOUND reject.no_rdns=1': function (test) {
        test.expect(1);
        this.plugin.refresh_config(this.connection);
        var err = new Error("test error");
        err.code = dns.NOTFOUND;
        this.plugin.cfg.reject.no_rdns=1;
        var cb = function () {
            test.equal(DENY, arguments[0]);
        };
        this.plugin.handle_ptr_error(this.connection, err, cb);
        test.done();
    },
    'dns.FAKE reject.no_rdns=0': function (test) {
        test.expect(1);
        this.plugin.refresh_config(this.connection);
        var err = new Error("test error");
        err.code = 'fake';
        this.plugin.cfg.reject.no_rdns=0;
        var cb = function () {
            test.equal(undefined, arguments[0]);
        };
        this.plugin.handle_ptr_error(this.connection, err, cb);
        test.done();
    },
    'dns.FAKE reject.no_rdns=1': function (test) {
        test.expect(1);
        this.plugin.refresh_config(this.connection);
        var err = new Error("test error");
        err.code = 'fake';
        this.plugin.cfg.reject.no_rdns=1;
        var cb = function () {
            test.equal(DENYSOFT, arguments[0]);
        };
        this.plugin.handle_ptr_error(this.connection, err, cb);
        test.done();
    },
};
