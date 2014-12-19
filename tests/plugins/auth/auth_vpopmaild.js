'use strict';

var Plugin       = require('../../fixtures/stub_plugin'),
    Connection   = require('../../fixtures/stub_connection'),
    config       = require('../../../config');

var _set_up = function(done) {
    this.backup = {};

    // needed for tests
    this.plugin = new Plugin('auth/auth_vpopmaild');
    this.plugin.inherits('auth/auth_base');
    this.plugin.config = config;
    this.plugin.cfg = config.get('auth_vpopmaild.ini');

    this.connection = Connection.createConnection();
    this.connection.capabilities=null;

    done();
};

exports.hook_capabilities = {
    setUp : _set_up,
    'no TLS': function (test) {
        var cb = function (rc, msg) {
            test.expect(3);
            test.equal(undefined, rc);
            test.equal(undefined, msg);
            test.equal(null, this.connection.capabilities);
            test.done();
        }.bind(this);
        this.plugin.hook_capabilities(cb, this.connection);
    },
    'with TLS': function (test) {
        var cb = function (rc, msg) {
            test.expect(3);
            test.equal(undefined, rc);
            test.equal(undefined, msg);
            test.ok(this.connection.capabilities.length);
            // console.log(this.connection.capabilities);
            test.done();
        }.bind(this);
        this.connection.using_tls=true;
        this.connection.capabilities=[];
        this.plugin.hook_capabilities(cb, this.connection);
    },
    'with TLS, sysadmin': function (test) {
        var cb = function (rc, msg) {
            test.expect(3);
            test.equal(undefined, rc);
            test.equal(undefined, msg);
            test.ok(this.connection.capabilities.length);
            // console.log(this.connection.capabilities);
            test.done();
        }.bind(this);
        this.connection.using_tls=true;
        this.connection.capabilities=[];
        this.plugin.hook_capabilities(cb, this.connection);
    },
};

exports.get_vpopmaild_socket = {
    setUp : _set_up,
    'any': function (test) {
        test.expect(1);
        var socket = this.plugin.get_vpopmaild_socket('foo@localhost.com');
        // console.log(socket);
        test.ok(socket);
        socket.end();
        test.done();
    }
};

exports.get_plain_passwd = {
    setUp : _set_up,
    'matt@example.com': function (test) {
        var cb = function(pass) {
            test.expect(1);
            test.ok(pass);
            test.done();
        };
        if (this.plugin.cfg['example.com'].sysadmin) {
            this.plugin.get_plain_passwd('matt@example.com', cb);
        }
        else {
            test.expect(0);
            test.done();
        }
    }
};
