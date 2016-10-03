'use strict';

// var Address      = require('address-rfc2821');
var fixtures     = require('haraka-test-fixtures');

var Connection   = fixtures.connection;
var Transaction  = fixtures.transaction;

var _set_up = function (done) {

    this.plugin = new fixtures.plugin('rspamd');
    this.plugin.register();
    this.connection = Connection.createConnection();
    this.connection.transaction = Transaction.createTransaction();

    done();
};

exports.register = {
    setUp : _set_up,
    'loads the rspamd plugin': function (test) {
        test.expect(1);
        test.equal('rspamd', this.plugin.name);
        test.done();
    },
    'register loads rspamd.ini': function (test) {
        test.expect(2);
        this.plugin.register();
        test.ok(this.plugin.cfg);
        test.equal(true, this.plugin.cfg.reject.spam);
        test.done();
    },
};

exports.load_rspamd_ini = {
    setUp : _set_up,
    'loads rspamd.ini': function (test) {
        test.expect(1);
        this.plugin.load_rspamd_ini();
        test.ok(this.plugin.cfg.header.bar);
        test.done();
    },
};

exports.add_headers = {
    setUp : _set_up,
    'add_headers exists as function': function (test) {
        test.expect(1);
        // console.log(this.plugin.cfg);
        test.equal('function', typeof this.plugin.add_headers);
        // test.ok(!this.plugin.score_too_high(this.connection, {score: 5}));
        test.done();
    },
    'adds a header to a message with positive score': function (test) {
        test.expect(2);
        var test_data = {
            score: 1,
        };
        this.plugin.add_headers(this.connection, test_data);
        test.equal(this.connection.transaction.header.headers['X-Rspamd-Score'], '1');
        test.equal(this.connection.transaction.header.headers['X-Rspamd-Bar'], '+');
        test.done();
    },
    'adds a header to a message with negative score': function (test) {
        test.expect(2);
        var test_data = {
            score: -1,
        };
        this.plugin.add_headers(this.connection, test_data);
        // console.log(this.connection.transaction.header);
        test.equal(this.connection.transaction.header.headers['X-Rspamd-Score'], '-1');
        test.equal(this.connection.transaction.header.headers['X-Rspamd-Bar'], '-');
        test.done();
    }
};
