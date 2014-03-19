var stub             = require('../fixtures/stub'),
    Plugin           = require('../fixtures/stub_plugin'),
    Connection       = require('../fixtures/stub_connection'),
    constants        = require('../../constants'),
    Address          = require('../../address');

// huge hack here, but plugin tests need constants
constants.import(global);

function _set_up(callback) {
    this.backup = {};

    // needed for tests
    this.plugin = Plugin('rcpt_to.qmail_deliverable');
    this.connection = Connection.createConnection();

    // going to need these in multiple tests
    // this.plugin.register();

    callback();
}

function _tear_down(callback) {
    callback();
}

exports.get_qmd_response = {
    setUp : _set_up,
    tearDown : _tear_down,
    'stub' : function (test) {
        test.expect(0);
        // can't really test this very well without a QMD server
        test.done();
    },
};

exports.check_qmd_reponse = {
    setUp : _set_up,
    tearDown : _tear_down,
    '11' : function (test) {
        test.expect(1);
        var r = this.plugin.check_qmd_reponse(this.connection, '11');
        test.equal(DENYSOFT, r[0]);
        test.done();
    },
    '12' : function (test) {
        test.expect(1);
        var r = this.plugin.check_qmd_reponse(this.connection, '12');
        test.equal(OK, r[0]);
        test.done();
    },
    '13' : function (test) {
        test.expect(1);
        var r = this.plugin.check_qmd_reponse(this.connection, '13');
        test.equal(OK, r[0]);
        test.done();
    },
    '14' : function (test) {
        test.expect(2);
        this.connection.transaction = {
            mail_from: new Address.Address('<matt@example.com>'),
        };
        var r = this.plugin.check_qmd_reponse(this.connection, '14');
        test.equal(OK, r[0]);

        this.connection.transaction.mail_from = new Address.Address('<>');
        r = this.plugin.check_qmd_reponse(this.connection, '14');
        test.equal(DENY, r[0]);
        test.done();
    },
    '21' : function (test) {
        test.expect(1);
        var r = this.plugin.check_qmd_reponse(this.connection, '21');
        test.equal(DENYSOFT, r[0]);
        test.done();
    },
    '22' : function (test) {
        test.expect(1);
        var r = this.plugin.check_qmd_reponse(this.connection, '22');
        test.equal(DENYSOFT, r[0]);
        test.done();
    },
    '2f' : function (test) {
        test.expect(1);
        var r = this.plugin.check_qmd_reponse(this.connection, '2f');
        test.equal(DENYSOFT, r[0]);
        test.done();
    },
    'f1' : function (test) {
        test.expect(1);
        var r = this.plugin.check_qmd_reponse(this.connection, 'f1');
        test.equal(OK, r[0]);
        test.done();
    },
    'f2' : function (test) {
        test.expect(1);
        var r = this.plugin.check_qmd_reponse(this.connection, 'f2');
        test.equal(OK, r[0]);
        test.done();
    },
    'f3' : function (test) {
        test.expect(1);
        var r = this.plugin.check_qmd_reponse(this.connection, 'f3');
        test.equal(OK, r[0]);
        test.done();
    },
    'f4' : function (test) {
        test.expect(1);
        var r = this.plugin.check_qmd_reponse(this.connection, 'f4');
        test.equal(OK, r[0]);
        test.done();
    },
    'f5' : function (test) {
        test.expect(1);
        var r = this.plugin.check_qmd_reponse(this.connection, 'f5');
        test.equal(OK, r[0]);
        test.done();
    },
    'f6' : function (test) {
        test.expect(1);
        var r = this.plugin.check_qmd_reponse(this.connection, 'f6');
        test.equal(OK, r[0]);
        test.done();
    },
    'fe' : function (test) {
        test.expect(1);
        var r = this.plugin.check_qmd_reponse(this.connection, 'fe');
        test.equal(DENYSOFT, r[0]);
        test.done();
    },
    'ff' : function (test) {
        test.expect(1);
        var r = this.plugin.check_qmd_reponse(this.connection, 'ff');
        test.equal(DENY, r[0]);
        test.done();
    },
    '0' : function (test) {
        test.expect(2);
        var r = this.plugin.check_qmd_reponse(this.connection, '0');
        test.equal(DENY, r[0]);
        test.equal('not deliverable', r[1]);
        test.done();
    },
    'blah' : function (test) {
        test.expect(1);
        var r = this.plugin.check_qmd_reponse(this.connection, 'blah');
        test.equal(undefined, r[0]);
        test.done();
    },
};

