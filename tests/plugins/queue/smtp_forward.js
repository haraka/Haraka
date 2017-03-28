'use strict';

var path         = require('path');

var Address      = require('address-rfc2821').Address;
var fixtures     = require('haraka-test-fixtures');

const OK = 906;

function _setup (done) {
    this.plugin = new fixtures.plugin('queue/smtp_forward');

    // switch config directory to 'tests/config'
    this.plugin.config = this.plugin.config.module_config(path.resolve('tests'));
    this.plugin.register();

    this.connection = new fixtures.connection.createConnection();
    this.connection.transaction = new fixtures.transaction.createTransaction();

    done();
}

exports.register = {
    setUp : _setup,
    'register': function (test) {
        test.expect(1);
        this.plugin.register();
        test.ok(this.plugin.cfg.main);
        test.done();
    },
};

exports.get_config = {
    setUp : _setup,
    'no recipient': function (test) {
        test.expect(2);
        var cfg = this.plugin.get_config(this.connection);
        test.equal(cfg.host, 'localhost');
        test.equal(cfg.enable_tls, true);
        test.done();
    },
    'null recipient': function (test) {
        test.expect(2);
        this.connection.transaction.rcpt_to.push(new Address('<>'));
        var cfg = this.plugin.get_config(this.connection);
        test.equal(cfg.host, 'localhost');
        test.equal(cfg.enable_tls, true);
        test.done();
    },
    'valid recipient': function (test) {
        test.expect(2);
        this.connection.transaction.rcpt_to.push(
            new Address('<matt@example.com>')
            );
        var cfg = this.plugin.get_config(this.connection);
        test.equal(cfg.enable_tls, true);
        test.equal(cfg.host, 'localhost');
        test.done();
    },
    'valid recipient with route': function (test) {
        test.expect(1);
        this.connection.transaction.rcpt_to.push(
            new Address('<matt@test.com>')
            );
        test.deepEqual(this.plugin.get_config(this.connection), {
            host: '1.2.3.4',
            enable_tls: true,
            auth_user: 'postmaster@test.com',
            auth_pass: 'superDuperSecret',
        });
        test.done();
    },
    'valid recipient with route & diff config': function (test) {
        test.expect(1);
        this.connection.transaction.rcpt_to.push(
            new Address('<matt@test1.com>')
            );
        var cfg = this.plugin.get_config(this.connection);
        test.deepEqual(cfg, {
            host: '1.2.3.4',
            enable_tls: false,
        });
        test.done();
    },
    'valid 2 recipients with same route': function (test) {
        test.expect(1);
        this.connection.transaction.rcpt_to.push(
            new Address('<matt@test.com>'),
            new Address('<matt@test.com>')
            );
        var cfg = this.plugin.get_config(this.connection);
        test.deepEqual(cfg.host, '1.2.3.4' );
        test.done();
    },
};

exports.get_mx = {
    setUp : _setup,
    'returns no outbound route for undefined domains' : function (test) {
        test.expect(2);
        var cb = function (code, mx) {
            test.equal(code, undefined);
            test.deepEqual(mx, undefined);
            test.done();
        };
        this.plugin.get_mx(cb, {}, 'undefined.com');
    },
    'returns an outbound route for defined domains' : function (test) {
        test.expect(2);
        var cb = function (code, mx) {
            test.equal(code, OK);
            test.deepEqual(mx, {
                priority: 0, exchange: '1.2.3.4', port: 2555,
                auth_user: 'postmaster@test.com',
                auth_pass: 'superDuperSecret'
            });
            test.done();
        };
        this.plugin.get_mx(cb, {}, 'test.com');
    },
}
