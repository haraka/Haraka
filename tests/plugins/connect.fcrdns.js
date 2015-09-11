'use strict';

var stub         = require('../fixtures/stub');
var Plugin       = require('../fixtures/stub_plugin');
var Connection   = require('../fixtures/stub_connection');
var config       = require('../../config');
var dns          = require('dns');

var _set_up = function (done) {

    this.plugin = new Plugin('connect.fcrdns');
    this.plugin.config = config;
    this.plugin.register();

    this.connection = Connection.createConnection();
    this.connection.auth_results = stub();

    done();
};

exports.refresh_config = {
    setUp : _set_up,
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

exports.is_generic_rdns = {
    setUp : _set_up,
    'mail.theartfarm.com': function (test) {
        test.expect(1);
        this.connection.remote_ip='208.75.177.101';
        test.equal(false, this.plugin.is_generic_rdns(this.connection, 'mail.theartfarm.com'));
        test.done();
    },
    'dsl-188-34-255-136.asretelecom.net': function (test) {
        test.expect(1);
        this.connection.remote_ip='188.34.255.136';
        test.ok(this.plugin.is_generic_rdns(this.connection, 'dsl-188-34-255-136.asretelecom.net'));
        test.done();
    },
    'c-76-121-96-159.hsd1.wa.comcast.net': function (test) {
        test.expect(1);
        this.connection.remote_ip='76.121.96.159';
        test.ok(this.plugin.is_generic_rdns(this.connection, 'c-76-121-96-159.hsd1.wa.comcast.net'));
        test.done();
    },
    'c-76-121-96-159.business.wa.comcast.net': function (test) {
        test.expect(1);
        this.connection.remote_ip='76.121.96.159';
        test.equal(false, this.plugin.is_generic_rdns(this.connection, 'c-76-121-96-159.business.wa.comcast.net'));
        test.done();
    },
    'null': function (test) {
        test.expect(1);
        this.connection.remote_ip='192.168.1.1';
        test.equal(false, this.plugin.is_generic_rdns(this.connection, null));
        test.done();
    },
    'tld, com': function (test) {
        test.expect(1);
        this.connection.remote_ip='192.168.1.1';
        test.equal(false, this.plugin.is_generic_rdns(this.connection, 'com'));
        test.done();
    },
    'empty string': function (test) {
        test.expect(1);
        this.connection.remote_ip='192.168.1.1';
        test.equal(false, this.plugin.is_generic_rdns(this.connection, ''));
        test.done();
    },
};

exports.save_auth_results = {
    setUp : _set_up,
    'fcrdns fail': function (test) {
        test.expect(1);
        this.connection.results.add(this.plugin, { pass: 'fcrdns' });
        test.equal(false, this.plugin.save_auth_results(this.connection));
        test.done();
    },
    'fcrdns pass': function (test) {
        test.expect(1);
        this.connection.results.push(this.plugin, {fcrdns: 'example.com'});
        test.equal(true, this.plugin.save_auth_results(this.connection));
        test.done();
    },
};

exports.ptr_compare = {
    setUp : _set_up,
    'fail': function (test) {
        test.expect(1);
        this.connection.remote_ip = '10.1.1.1';
        var iplist = ['10.0.1.1'];
        test.equal(false, this.plugin.ptr_compare(iplist, this.connection, 'foo.example.com'));
        test.done();
    },
    'pass exact': function (test) {
        test.expect(1);
        this.connection.remote_ip = '10.1.1.1';
        var iplist = ['10.1.1.1'];
        test.equal(true, this.plugin.ptr_compare(iplist, this.connection, 'foo.example.com'));
        test.done();
    },
    'pass net': function (test) {
        test.expect(1);
        this.connection.remote_ip = '10.1.1.1';
        var iplist = ['10.1.1.2'];
        test.equal(true, this.plugin.ptr_compare(iplist, this.connection, 'foo.example.com'));
        test.done();
    },
};

exports.check_fcrdns = {
    setUp : _set_up,
    'fail, tolerate': function (test) {
        test.expect(1);
        var cb = function (rc, msg) {
            test.equal(rc, undefined);
            test.done();
        };
        this.connection.remote_ip = '10.1.1.1';
        this.connection.results.add(this.plugin, {
            fcrdns: [], invalid_tlds: [], other_ips: [], ptr_names: [],
            ptr_multidomain: false, has_rdns: false, ptr_name_has_ips: false,
            ptr_name_to_ip: {},
        });
        this.plugin.check_fcrdns(this.connection, ['foo.example.com'], cb);
    },
    'null host': function (test) {
        // this result was experienced "in the wild"
        test.expect(1);
        var cb = function (rc, msg) {
            test.equal(rc, undefined);
            test.done();
        };
        this.connection.remote_ip = '10.1.1.1';
        this.connection.results.add(this.plugin, {
            fcrdns: [], invalid_tlds: [], other_ips: [], ptr_names: [],
            ptr_multidomain: false, has_rdns: false, ptr_name_has_ips: false,
            ptr_name_to_ip: {},
        });
        this.plugin.check_fcrdns(this.connection, ['foo.example.com','', null], cb);
    },
};
