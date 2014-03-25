var stub         = require('../fixtures/stub'),
    constants    = require('../../constants'),
    Connection   = require('../fixtures/stub_connection'),
    Plugin       = require('../fixtures/stub_plugin'),
    configfile   = require('../../configfile'),
    config       = require('../../config'),
    ResultStore  = require("../../result_store");

// huge hack here, but plugin tests need constants
constants.import(global);

function _set_up(callback) {
    this.backup = {};

    // needed for tests
    this.plugin = Plugin('relay_acl');
    this.plugin.config = config;
    this.plugin.cfg = {};

    this.connection = Connection.createConnection();
    this.connection.results = new ResultStore(this.connection);
    this.connection.transaction = {
        results: new ResultStore(this.connection),
    };

    // going to need these in multiple tests
    // this.plugin.register();

    callback();
}

function _tear_down(callback) {
    callback();
}

exports.is_acl_allowed = {
    setUp : _set_up,
    tearDown : _tear_down,
    'bare IP' : function (test) {
        test.expect(3);
        this.plugin.acl_allow=['127.0.0.6'];
        this.connection.remote_ip='127.0.0.6';
        test.equal(true, this.plugin.is_acl_allowed(this.connection));
        this.connection.remote_ip='127.0.0.5';
        test.equal(false, this.plugin.is_acl_allowed(this.connection));
        this.connection.remote_ip='127.0.1.5';
        test.equal(false, this.plugin.is_acl_allowed(this.connection));
        test.done();
    },
    'netmask' : function (test) {
        test.expect(3);
        this.plugin.acl_allow=['127.0.0.6/24'];
        this.connection.remote_ip='127.0.0.6';
        test.equal(true, this.plugin.is_acl_allowed(this.connection));
        this.connection.remote_ip='127.0.0.5';
        test.equal(true, this.plugin.is_acl_allowed(this.connection));
        this.connection.remote_ip='127.0.1.5';
        test.equal(false, this.plugin.is_acl_allowed(this.connection));
        test.done();
    },
    'mixed (ipv4 & ipv6 (Issue #428))' : function (test) {
        test.expect(3);
        this.connection.remote_ip='2607:f060:b008:feed::2';
        test.equal(false, this.plugin.is_acl_allowed(this.connection));

        this.plugin.acl_allow=['2607:f060:b008:feed::2/64'];
        this.connection.remote_ip='2607:f060:b008:feed::2';
        test.equal(true, this.plugin.is_acl_allowed(this.connection));

        this.plugin.acl_allow=['127.0.0.6/24'];
        this.connection.remote_ip='2607:f060:b008:feed::2';
        test.equal(false, this.plugin.is_acl_allowed(this.connection));

        test.done();
    },
};

exports.relay_dest_domains = {
    setUp : _set_up,
    tearDown : _tear_down,
    'relaying' : function (test) {
        test.expect(2);
        var outer = this;
        var next = function() {
            // console.log(outer.connection.results.get('relay_acl'));
            // console.log(outer.connection.transaction.results.get('relay_acl'));
            test.equal(undefined, arguments[0]);
            test.equal(1, outer.connection.transaction.results.get('relay_acl').skip.length);
            test.done();
        };
        this.connection.relaying=true;
        this.plugin.relay_dest_domains(next, this.connection, [{host:'foo'}]);
    },
    'no config' : function (test) {
        test.expect(2);
        var outer = this;
        var next = function() {
            test.equal(undefined, arguments[0]);
            test.equal(1, outer.connection.transaction.results.get('relay_acl').skip.length);
            test.done();
        };
        this.plugin.relay_dest_domains(next, this.connection, [{host:'foo'}]);
    },
    'action=undef' : function (test) {
        test.expect(2);
        var outer = this;
        var next = function() {
            test.equal(DENY, arguments[0]);
            test.equal(1, outer.connection.transaction.results.get('relay_acl').fail.length);
            test.done();
        };
        this.plugin.cfg.domains = { foo: '{"action":"dunno"}', };
        this.plugin.relay_dest_domains(next, this.connection, [{host:'foo'}]);
    },
    'action=deny' : function (test) {
        test.expect(2);
        var outer = this;
        var next = function() {
            test.equal(DENY, arguments[0]);
            test.equal(1, outer.connection.transaction.results.get('relay_acl').fail.length);
            test.done();
        };
        this.plugin.cfg.domains = { foo: '{"action":"deny"}', };
        this.plugin.relay_dest_domains(next, this.connection, [{host:'foo'}]);
    },
    'action=continue' : function (test) {
        test.expect(2);
        var outer = this;
        var next = function() {
            test.equal(CONT, arguments[0]);
            test.equal(1, outer.connection.transaction.results.get('relay_acl').pass.length);
            test.done();
        };
        this.plugin.cfg.domains = { foo: '{"action":"continue"}', };
        this.plugin.relay_dest_domains(next, this.connection, [{host:'foo'}]);
    },
    'action=accept' : function (test) {
        test.expect(2);
        var outer = this;
        var next = function() {
            test.equal(CONT, arguments[0]);
            test.equal(1, outer.connection.transaction.results.get('relay_acl').pass.length);
            test.done();
        };
        this.plugin.cfg.domains = { foo: '{"action":"continue"}', };
        this.plugin.relay_dest_domains(next, this.connection, [{host:'foo'}]);
    },
};

exports.refresh_config = {
    setUp : _set_up,
    tearDown : _tear_down,
    'callback' : function (test) {
        test.expect(1);
        var outer = this;
        var next = function() {
            test.equal(undefined, arguments[0]);
            test.done();
        };
        this.plugin.refresh_config(next, this.connection);
    },
};
