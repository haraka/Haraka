'use strict';

var stub         = require('../../fixtures/stub');
var Connection   = require('../../fixtures/stub_connection');
var Plugin       = require('../../fixtures/stub_plugin');

var config       = require('../../../config');
var Address      = require('../../../address').Address;

var _set_up = function (done) {

    this.plugin = new Plugin('queue/smtp_forward');
    this.plugin.config = config;

    done();
};

exports.register = {
    setUp : function (done) {
        this.plugin = new Plugin('queue/smtp_forward');
        this.plugin.config = config;
        done();
    },
    'register': function (test) {
        test.expect(1);
        this.plugin.register();
        test.ok(this.plugin.cfg.main);
        test.done();
    },
};

exports.get_config = {
    setUp : function (done) {
        this.plugin = new Plugin('queue/smtp_forward');
        this.plugin.config = config;
        this.plugin.register();

        this.connection = Connection.createConnection();
        this.connection.transaction = { rcpt_to: [] };

        done();
    },
    'no recipient': function (test) {
        test.expect(1);
        var cfg = this.plugin.get_config(this.connection);
        test.ok(cfg.enable_tls !== undefined);
        test.done();
    },
    'null recipient': function (test) {
        test.expect(1);
        this.connection.transaction.rcpt_to.push(new Address('<>'));
        var cfg = this.plugin.get_config(this.connection);
        test.ok(cfg.enable_tls !== undefined);
        test.done();
    },
    'valid recipient': function (test) {
        test.expect(1);
        this.connection.transaction.rcpt_to.push(
            new Address('<matt@test.com>')
            );
        var cfg = this.plugin.get_config(this.connection);
        test.ok(cfg.enable_tls !== undefined);
        test.done();
    },
    'valid recipient with route': function (test) {
        test.expect(1);
        this.plugin.cfg['test.com'] = { host: '1.2.3.4' };
        this.connection.transaction.rcpt_to.push(
            new Address('<matt@test.com>')
            );
        var cfg = this.plugin.get_config(this.connection);
        test.ok(cfg.host === '1.2.3.4' );
        test.done();
    },
};