'use strict';

var stub         = require('../fixtures/stub'),
    Plugin       = require('../fixtures/stub_plugin'),
    Connection   = require('../fixtures/stub_connection'),
    Address      = require('../../address'),
    config       = require('../../config');

var _set_up = function (done) {

    this.plugin = new Plugin('spamassassin');
    this.plugin.config = config;
    this.plugin.cfg = { main: { } };

    this.connection = Connection.createConnection();
    this.connection.transaction = stub;
    this.connection.transaction.notes = {};

    done();
};

exports.register = {
    setUp : _set_up,
    'loads the spamassassin plugin': function (test) {
        test.expect(1);
        test.equal('spamassassin', this.plugin.name);
        test.done();
    },
    'register loads spamassassin.ini': function (test) {
        test.expect(2);
        this.plugin.register();
        test.ok(this.plugin.cfg);
        test.ok(this.plugin.cfg.main.spamd_socket);
        test.done();
    },
};

exports.load_spamassassin_ini = {
    setUp : _set_up,
    'loads spamassassin.ini': function (test) {
        test.expect(2);
        test.equal(undefined, this.plugin.cfg.main.spamd_socket);
        this.plugin.load_spamassassin_ini();
        test.ok(this.plugin.cfg.main.spamd_socket);
        test.done();
    },
};

exports.msg_too_big = {
    setUp : _set_up,
    'max_size not set': function (test) {
        test.expect(1);
        test.equal(false, this.plugin.msg_too_big(this.connection));
        test.done();
    },
    'max_size 10, data_bytes 9 = false': function (test) {
        test.expect(1);
        this.plugin.cfg.main = { max_size: 10 };
        this.connection.transaction.data_bytes = 9;
        test.equal(false, this.plugin.msg_too_big(this.connection));
        test.done();
    },
    'max_size 10, data_bytes 11 = true': function (test) {
        test.expect(1);
        this.plugin.cfg.main = { max_size: 10 };
        this.connection.transaction.data_bytes = 11;
        test.equal(true, this.plugin.msg_too_big(this.connection));
        test.done();
    },
};

// console.log(this.plugin.cfg);

exports.get_spamd_headers = {
    setUp : _set_up,
    'returns a spamd protocol request': function (test) {
        test.expect(1);
        this.connection.transaction.mail_from = new Address.Address('<matt@example.com>');
        this.connection.transaction.uuid = 'THIS-IS-A-TEST-UUID';
        var headers = this.plugin.get_spamd_headers(this.connection, 'test_user');
        var expected_headers = [
                'HEADERS SPAMC/1.3',
                'User: test_user',
                '',
                'X-Envelope-From: matt@example.com',
                'X-Haraka-UUID: THIS-IS-A-TEST-UUID'
            ];
        test.deepEqual(headers, expected_headers);
        test.done();
    },
};

exports.get_spamd_username = {
    setUp : _set_up,
    'default': function (test) {
        test.expect(1);
        test.equal('default', this.plugin.get_spamd_username(this.connection));
        test.done();
    },
    'set in txn.notes.spamd_user': function (test) {
        test.expect(1);
        this.connection.transaction.notes.spamd_user = 'txuser';
        test.equal('txuser', this.plugin.get_spamd_username(this.connection));
        test.done();
    },
    'set in cfg.main.spamd_user': function (test) {
        test.expect(1);
        this.plugin.cfg.main.spamd_user = 'cfguser';
        test.equal('cfguser', this.plugin.get_spamd_username(this.connection));
        test.done();
    },
    'set to first-recipient': function (test) {
        this.plugin.cfg.main.spamd_user = 'first-recipient';
        this.connection.transaction.rcpt_to = [ new Address.Address('<matt@example.com>') ];
        test.equal('matt@example.com', this.plugin.get_spamd_username(this.connection));

        test.done();
    },
};

exports.score_too_high = {
    setUp : _set_up,
    'no threshhold is not too high': function (test) {
        test.expect(1);
        test.ok(!this.plugin.score_too_high(this.connection, {score: 5}));
        test.done();
    },
    'too high score is too high': function (test) {
        test.expect(1);
        this.plugin.cfg.main.reject_threshold = 5;
        test.equal('spam score exceeded threshold', this.plugin.score_too_high(this.connection, {score: 6}));
        test.done();
    },
    'ok score with relaying is ok': function (test) {
        test.expect(1);
        this.connection.relaying = true;
        this.plugin.cfg.main.relay_reject_threshold = 7;
        test.equal(false, this.plugin.score_too_high(this.connection, {score: 6}));
        test.done();
    },
    'too high score with relaying is too high': function (test) {
        test.expect(1);
        this.connection.relaying = true;
        this.plugin.cfg.main.relay_reject_threshold = 7;
        test.equal('spam score exceeded relay threshold', this.plugin.score_too_high(this.connection, {score: 8}));
        test.done();
    },
};
