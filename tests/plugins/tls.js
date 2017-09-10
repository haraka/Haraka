'use strict';

const path         = require('path');

const fixtures     = require('haraka-test-fixtures');
const Plugin       = fixtures.plugin;

function _set_up (done) {
    const plugin = new Plugin('tls');
    this.plugin = plugin;
    this.connection = new fixtures.connection.createConnection();

    // use tests/config instead of ./config
    plugin.config = plugin.config.module_config(path.resolve('tests'));
    plugin.net_utils.config = plugin.net_utils.config.module_config(path.resolve('tests'));

    plugin.tls_opts = {};
    done();
}

exports.plugin = {
    setUp : _set_up,
    'has function register' : function (test) {
        test.expect(2);
        test.ok(this.plugin);
        test.equal('function', typeof this.plugin.register);
        test.done();
    },
    'has function load_tls_ini' : function (test) {
        test.expect(1);
        test.equal('function', typeof this.plugin.load_tls_ini);
        test.done();
    },
    'has function upgrade_connection' : function (test) {
        test.expect(1);
        test.equal('function', typeof this.plugin.upgrade_connection);
        test.done();
    },
    'has function advertise_starttls' : function (test) {
        test.expect(1);
        test.equal('function', typeof this.plugin.advertise_starttls);
        test.done();
    },
    'has function emit_upgrade_msg' : function (test) {
        test.expect(1);
        test.equal('function', typeof this.plugin.emit_upgrade_msg);
        test.done();
    },
}

exports.register = {
    setUp : function (done) {
        this.plugin = new Plugin('tls');
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
}

exports.emit_upgrade_msg = {
    setUp : _set_up,
    'should emit a log message': function (test) {
        test.expect(1);
        test.equal(this.plugin.emit_upgrade_msg(this.connection, true, '', {
            subject: {
                CN: 'TLS.subject',
                O: 'TLS.org'
            },
        }),
        'secured: verified=true cn="TLS.subject" organization="TLS.org"');
        test.done();
    },
    'should emit a log message with error': function (test) {
        test.expect(1);
        test.equal(this.plugin.emit_upgrade_msg(this.connection, true, 'oops', {
            subject: {
                CN: 'TLS.subject',
                O: 'TLS.org'
            },
        }),
        'secured: verified=true error="oops" cn="TLS.subject" organization="TLS.org"');
        test.done();
    }
}
