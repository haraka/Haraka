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
        test.expect(3);
        var test_data = {
            score: 1.1,
            default: {
                FOO: {
                    name: 'FOO',
                    score: 0.100000,
                    description: 'foo',
                    options: ['foo', 'bar'],
                },
                BAR: {
                    name: 'BAR',
                    score: 1.0,
                    description: 'bar',
                }
            }
        };
        this.plugin.add_headers(this.connection, test_data);
        test.equal(this.connection.transaction.header.headers['X-Rspamd-Score'], '1.1');
        test.equal(this.connection.transaction.header.headers['X-Rspamd-Bar'], '+');
        test.equal(this.connection.transaction.header.headers['X-Rspamd-Report'], 'FOO(0.1) BAR(1)');
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

exports.wants_headers_added = {
    setUp : _set_up,
    'wants no headers when add_headers=never': function (test) {
        test.expect(1);
        this.plugin.cfg.main.add_headers='never';
        test.equal(
            this.plugin.wants_headers_added({ default: { action: 'add header' }}),
            false
            );
        test.done();
    },
    'always wants no headers when add_headers=always': function (test) {
        test.expect(1);
        this.plugin.cfg.main.add_headers='always';
        test.equal(
            this.plugin.wants_headers_added({ default: { action: 'beat it' }}),
            true
            );
        test.done();
    },
    'wants headers when rspamd response indicates, add_headers=sometimes': function (test) {
        test.expect(2);
        this.plugin.cfg.main.add_headers='sometimes';
        test.equal(
            this.plugin.wants_headers_added({ default: { action: 'add header' }}),
            true
            );
        test.equal(
            this.plugin.wants_headers_added({ default: { action: 'brownlist' }}),
            false
            );
        test.done();
    }
}