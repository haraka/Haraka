'use strict';

var stub             = require('../fixtures/stub');
var Connection       = require('../fixtures/stub_connection');
var Plugin           = require('../fixtures/stub_plugin');
var config           = require('../../config');
var ResultStore      = require('../../result_store');

var _set_up = function (done) {
    
    this.plugin = new Plugin('limit');

    this.plugin.config = config;
    this.plugin.cfg = { main: {} };

    this.connection = Connection.createConnection();
    this.connection.results = new ResultStore(this.plugin);
    this.connection.transaction = stub;

    this.plugin.register();
    done();
};

exports.login_init = {
    setUp : _set_up,
    'register': function (test) {
        test.expect(1);
        this.plugin.register();
        test.ok(this.plugin.cfg); // loaded config
        test.done();
    },
};

exports.max_errors = {
    setUp : _set_up,
    'none': function (test) {
        // console.log(this);
        test.expect(2);
        var cb = function (rc, msg) {
            // console.log(arguments);
            test.equal(rc, null);
            test.equal(msg, null);
            test.done();
        };
        this.plugin.max_errors(cb, this.connection);
    },
    'too many': function (test) {
        // console.log(this);
        test.expect(2);
        var cb = function (rc, msg) {
            // console.log(arguments);
            test.equal(rc, DENYSOFTDISCONNECT);
            test.equal(msg, 'Too many errors');
            test.done();
        };
        this.connection.errors=10;
        this.plugin.cfg.errors = { max: 9 };
        this.plugin.max_errors(cb, this.connection);
    },
};

exports.max_recipients = {
    setUp : _set_up,
    'none': function (test) {
        test.expect(2);
        var cb = function (rc, msg) {
            // console.log(arguments);
            test.equal(rc, null);
            test.equal(msg, null);
            test.done();
        };
        this.plugin.max_recipients(cb, this.connection);
    },
    'too many': function (test) {
        test.expect(2);
        var cb = function (rc, msg) {
            // console.log(arguments);
            test.equal(rc, DENYSOFT);
            test.equal(msg, 'Too many recipients');
            test.done();
        };
        this.connection.rcpt_count = { accept: 3, tempfail: 5, reject: 4 };
        this.plugin.cfg.recipients = { max: 10 };
        this.plugin.max_recipients(cb, this.connection);
    },
};

exports.max_unrecognized_commands = {
    setUp : _set_up,
    'none': function (test) {
        // console.log(this);
        test.expect(2);
        var cb = function (rc, msg) {
            // console.log(arguments);
            test.equal(rc, null);
            test.equal(msg, null);
            test.done();
        };
        this.plugin.max_unrecognized_commands(cb, this.connection);
    },
    'too many': function (test) {
        // console.log(this);
        test.expect(2);
        var cb = function (rc, msg) {
            // console.log(arguments);
            test.equal(rc, DENYDISCONNECT);
            test.equal(msg, 'Too many unrecognized commands');
            test.done();
        };
        this.plugin.cfg.unrecognized_commands = { max: 5 };
        this.connection.results.incr(this.plugin, {'unrec_cmds': 6});
        this.plugin.max_unrecognized_commands(cb, this.connection);
    },
};

exports.check_concurrency = {
    setUp : _set_up,
    'none': function (test) {
        test.expect(2);
        var cb = function (rc, msg) {
            // console.log(arguments);
            test.equal(rc, null);
            test.equal(msg, null);
            test.done();
        };
        this.plugin.check_concurrency(cb, this.connection);
    },
    'at max': function (test) {
        test.expect(2);
        var cb = function (rc, msg) {
            // console.log(arguments);
            test.equal(rc, null);
            test.equal(msg, null);
            test.done();
        };
        var self = this;
        self.plugin.cfg.concurrency.history = undefined;
        self.plugin.cfg.concurrency = { max: 4 };
        self.connection.notes.limit=4;
        self.plugin.check_concurrency(cb, self.connection);
    },
    'too many': function (test) {
        test.expect(2);
        var cb = function (rc, msg) {
            // console.log(arguments);
            test.equal(rc, DENYSOFTDISCONNECT);
            test.equal(msg, 'Too many concurrent connections');
            test.done();
        };
        var self = this;
        self.plugin.cfg.concurrency.history = undefined;
        self.plugin.cfg.concurrency = { max: 4 };
        self.plugin.cfg.concurrency.disconnect_delay=1;
        self.connection.notes.limit=5;
        self.plugin.check_concurrency(cb, self.connection);
    },
};
