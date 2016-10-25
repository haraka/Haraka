'use strict';

var path         = require('path');

var Address      = require('address-rfc2821').Address;
var fixtures     = require('haraka-test-fixtures');

var Connection   = fixtures.connection;

function _setup (done) {
    this.plugin = new fixtures.plugin('queue/smtp_forward');

    // switch config directory to 'tests/config'
    this.plugin.config = this.plugin.config.module_config(path.resolve('tests'));
    this.plugin.register();

    this.connection = Connection.createConnection();
    this.connection.transaction = fixtures.transaction.createTransaction();

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
    'valid 2 recipients with different routes': function (test) {
        test.expect(1);
        this.connection.transaction.rcpt_to.push(
            new Address('<matt@test1.com>'),
            new Address('<matt@test2.com>')
            );
        var cfg = this.plugin.get_config(this.connection);
        test.equal(cfg.host, 'localhost' );
        test.done();
    },
};
