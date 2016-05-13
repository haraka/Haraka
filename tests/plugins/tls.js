'use strict';

var fs           = require('fs');

var fixtures     = require('haraka-test-fixtures');

var Connection   = fixtures.connection;
var Plugin       = fixtures.plugin;

var _set_up = function (done) {
    this.plugin = new Plugin('tls');
    this.connection = Connection.createConnection();
    done();
};

exports.plugin = {
    setUp : _set_up,
    'should have function register' : function (test) {
        test.expect(2);
        test.isNotNull(this.plugin);
        test.isFunction(this.plugin.register);
        test.done();
    },
    'should have function tls_unrecognized_command' : function (test) {
        test.expect(1);
        test.isFunction(this.plugin.tls_unrecognized_command);
        test.done();
    },
    'should have function tls_capabilities' : function (test) {
        test.expect(1);
        test.isFunction(this.plugin.tls_capabilities);
        test.done();
    },
};

exports.load_tls_ini = {
    setUp: function(done) {
        this.plugin = new Plugin('tls');
        this.plugin.tls_opts = {};
        done();
    },
    'loads tls.ini' : function (test) {
        test.expect(3);
        this.plugin.load_tls_ini();
        test.ok(this.plugin.cfg.main.requestCert);
        test.ok(this.plugin.cfg.main.ciphers);
        test.ok(this.plugin.cfg.no_tls_hosts);
        // console.log(this.plugin.cfg);
        test.done();
    }
};

exports.register = {
    setUp : function(done) {
        this.plugin = new Plugin('tls');

        // overload load_pem to get files from tests/config
        this.plugin.load_pem = function (file) {
            return fs.readFileSync('./tests/config/' + file);
        };

        done();
    },
    'with certs, should call register_hook()' : function (test) {
        test.expect(2);
        this.plugin.register();
        test.ok(this.plugin.cfg.main.requestCert);
        test.ok(this.plugin.register_hook.called);
        // console.log(this.plugin);
        test.done();
    },
};

exports.dont_register = {
    setUp : function(done) {
        this.plugin = new Plugin('tls');

        // overload load_pem to get files from tests/config
        this.plugin.load_pem = function (file) {
            try {
                return fs.readFileSync('./non-exist/config/' + file);
            }
            catch (ignore) {}
        };

        done();
    },
    'w/o certs, should not call register_hook()' : function (test) {
        test.expect(1);
        this.plugin.register();
        test.equal(this.plugin.register_hook.called, false);
        // console.log(this.plugin);
        test.done();
    },
};
