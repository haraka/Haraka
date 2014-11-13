
var stub         = require('../fixtures/stub'),
    Plugin       = require('../fixtures/stub_plugin'),
    Connection   = require('../fixtures/stub_connection'),
    Address      = require('../../address'),
    configfile   = require('../../configfile'),
    config       = require('../../config');

function _set_up(callback) {

    this.plugin = Plugin('spamassassin');
    this.plugin.config = config;
    this.plugin.cfg = { main: { } };

    this.connection = Connection.createConnection();
    // this.connection.results = new ResultStore(this.plugin);
    this.connection.transaction = stub;
    this.connection.transaction.notes = {};

    callback();
}

function _tear_down(callback) {
    callback();
}

exports.register = {
    setUp : _set_up,
    tearDown : _tear_down,
    'spamassassin loaded': function (test) {
        test.expect(1);
        test.equal('spamassassin', this.plugin.name);
        test.done();
    },
    'msg_too_big': function (test) {
        test.expect(3);
        // max_size not set
        test.equal(false, this.plugin.msg_too_big(this.connection));

        this.plugin.cfg.main = { max_size: 10 };
        this.connection.transaction.data_bytes = 9;
        test.equal(false, this.plugin.msg_too_big(this.connection));

        this.connection.transaction.data_bytes = 11;
        test.equal(true, this.plugin.msg_too_big(this.connection));
        test.done();
    },
    'get_spamd_headers': function (test) {
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
    'get_spamd_username': function (test) {
        test.expect(4);
        test.equal('default', this.plugin.get_spamd_username(this.connection));

        this.connection.transaction.notes.spamd_user = 'txuser';
        test.equal('txuser', this.plugin.get_spamd_username(this.connection));

        delete this.connection.transaction.notes.spamd_user;
        this.plugin.cfg.main.spamd_user = 'cfguser';
        test.equal('cfguser', this.plugin.get_spamd_username(this.connection));

        this.plugin.cfg.main.spamd_user = 'first-recipient';
        this.connection.transaction.rcpt_to = [ new Address.Address('<matt@example.com>') ];
        test.equal('matt@example.com', this.plugin.get_spamd_username(this.connection));

        test.done();
    },
    'score_too_high': function (test) {
        test.expect(4);

        var r = this.plugin.score_too_high(this.connection, {score: 5});
        test.ok(!r);

        this.plugin.cfg.main.reject_threshold = 5;
        r = this.plugin.score_too_high(this.connection, {score: 6});
        test.equal('spam score exceeded threshold', r);

        this.connection.relaying = true;
        this.plugin.cfg.main.relay_reject_threshold = 7;
        r = this.plugin.score_too_high(this.connection, {score: 6});
        test.equal('spam score exceeded threshold', r);

        r = this.plugin.score_too_high(this.connection, {score: 8});
        test.equal('spam score exceeded relay threshold', r);

        test.done();
    },
};
