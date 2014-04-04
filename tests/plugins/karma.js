var stub             = require('../fixtures/stub'),
    Connection       = require('../fixtures/stub_connection'),
    Plugin           = require('../fixtures/stub_plugin'),
    configfile       = require('../../configfile'),
    config           = require('../../config'),
//  Header           = require('../../mailheader').Header,
    ResultStore      = require("../../result_store"),
    constants        = require('../../constants');

try {
    var redis = require('redis');
}
catch (e) {
    console.log(e + "\nunable to load redis, skipping tests");
    return;
}

constants.import(global);

function _set_up(callback) {
    this.backup = {};

    // needed for tests
    this.plugin = Plugin('karma');
    this.plugin.config = config;
    this.plugin.cfg = { main: {} };

    this.connection = Connection.createConnection();
    this.connection.results = new ResultStore(this.plugin);

    callback();
}
function _tear_down(callback) {
    callback();
}

exports.karma_init = {
    setUp : _set_up,
    tearDown : _tear_down,
    'init': function (test) {
        test.expect(4);
        var cb = function (rc) {
            test.equal(undefined, rc);
            test.ok(this.plugin.cfg.asn);
            test.ok(this.plugin.deny_hooks);
            test.ok(this.plugin.db);
            test.done();
        }.bind(this);
        this.plugin.karma_init(cb);
    },
};

exports.results_init = {
    setUp : _set_up,
    tearDown : _tear_down,
    'init, pre': function (test) {
        test.expect(1);
        var r = this.connection.results.get('karma');
        test.equal(undefined, r);
        test.done();
    },
    'init, empty cfg': function (test) {
        this.plugin.results_init(this.connection);
        var r = this.connection.results.get('karma');
        test.expect(1);
        test.ok(r);
        test.done();
    },
    'init, cfg': function (test) {
        this.plugin.cfg.awards = { test: 1 };
        this.plugin.results_init(this.connection);
        var r = this.connection.results.get('karma');
        test.expect(2);
        test.ok(r);
        test.ok(r.todo);
        test.done();
    },
};

exports.apply_tarpit = {
    setUp : _set_up,
    tearDown : _tear_down,
    'tarpit=false': function (test) {
        test.expect(2);
        test.equal(undefined, this.connection.notes.tarpit);
        this.plugin.apply_tarpit(this.connection, 'connect', 0);
        test.equal(undefined, this.connection.notes.tarpit);
        test.done();
    },
    'tarpit=true, score=0': function (test) {
        test.expect(2);
        this.plugin.cfg.tarpit = { max: 1, delay: 0 };
        test.equal(undefined, this.connection.notes.tarpit);
        this.plugin.apply_tarpit(this.connection, 'connect', 0);
        test.equal(undefined, this.connection.notes.tarpit);
        test.done();
    },
    'tarpit=true, score=1': function (test) {
        test.expect(1);
        this.plugin.cfg.tarpit = { max: 1, delay: 0 };
        this.plugin.apply_tarpit(this.connection, 'connect', 1);
        test.equal(undefined, this.connection.notes.tarpit);
        test.done();
    },
    'tarpit=true, score=-1': function (test) {
        test.expect(1);
        this.plugin.cfg.tarpit = { max: 1, delay: 0 };
        this.plugin.apply_tarpit(this.connection, 'connect', -1);
        test.equal(1, this.connection.notes.tarpit);
        test.done();
    },
    'tarpit=true, score=-2, max=1': function (test) {
        test.expect(1);
        this.plugin.cfg.tarpit = { max: 1, delay: 0 };
        this.plugin.apply_tarpit(this.connection, 'connect', -2);
        test.equal(1, this.connection.notes.tarpit);
        test.done();
    },
    'tarpit=true, score=connect, max=1': function (test) {
        test.expect(1);
        this.plugin.cfg.tarpit = { max: 1, delay: 0 };
        this.connection.results.add(this.plugin, { connect: -2 });
        this.plugin.apply_tarpit(this.connection, 'connect', -2);
        test.equal(1, this.connection.notes.tarpit);
        test.done();
    },
};

exports.max_concurrent = {
    setUp : _set_up,
    tearDown : _tear_down,
    'no results': function (test) {
        test.expect(1);
        var cb = function (rc, msg) {
            test.equal(undefined, rc);
            test.done();
        }.bind(this);
        this.plugin.max_concurrent(cb, this.connection);
    },
    'results fail=0': function (test) {
        test.expect(1);
        var cb = function (rc, msg) {
            test.equal(undefined, rc);
            test.done();
        }.bind(this);
        this.connection.results.add(this.plugin, {pass: 'test pass'});
        this.plugin.max_concurrent(cb, this.connection);
    },
    'results fail=max_concurrent': function (test) {
        test.expect(2);
        var cb = function (rc, msg) {
            test.equal(DENYSOFTDISCONNECT, rc);
            test.ok(msg);
            test.done();
        }.bind(this);
        this.plugin.cfg.concurrency = {disconnect_delay: 1};
        this.connection.results.add(this.plugin, {fail: 'max_concurrent'});
        this.plugin.max_concurrent(cb, this.connection);
    },
};


