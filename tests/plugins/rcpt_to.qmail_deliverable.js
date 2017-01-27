'use strict';

var Address      = require('address-rfc2821');
var fixtures     = require('haraka-test-fixtures');

var _set_up = function (done) {

    this.plugin = new fixtures.plugin('rcpt_to.qmail_deliverable');
    this.connection = fixtures.connection.createConnection();

    done();
};

exports.get_qmd_response = {
    setUp : _set_up,
    'stub' : function (test) {
        test.expect(0);
        // can't really test this very well without a QMD server
        test.done();
    },
};

exports.check_qmd_response = {
    setUp : _set_up,
    '11' : function (test) {
        test.expect(1);
        var r = this.plugin.check_qmd_response(this.connection, '11');
        test.equal(DENYSOFT, r[0]);
        test.done();
    },
    '12' : function (test) {
        test.expect(1);
        var r = this.plugin.check_qmd_response(this.connection, '12');
        test.equal(OK, r[0]);
        test.done();
    },
    '13' : function (test) {
        test.expect(1);
        var r = this.plugin.check_qmd_response(this.connection, '13');
        test.equal(OK, r[0]);
        test.done();
    },
    '14' : function (test) {
        test.expect(2);
        this.connection.transaction = {
            mail_from: new Address.Address('<matt@example.com>'),
        };
        var r = this.plugin.check_qmd_response(this.connection, '14');
        test.equal(OK, r[0]);

        this.connection.transaction.mail_from = new Address.Address('<>');
        r = this.plugin.check_qmd_response(this.connection, '14');
        test.equal(DENY, r[0]);
        test.done();
    },
    '21' : function (test) {
        test.expect(1);
        var r = this.plugin.check_qmd_response(this.connection, '21');
        test.equal(DENYSOFT, r[0]);
        test.done();
    },
    '22' : function (test) {
        test.expect(1);
        var r = this.plugin.check_qmd_response(this.connection, '22');
        test.equal(DENYSOFT, r[0]);
        test.done();
    },
    '2f' : function (test) {
        test.expect(1);
        var r = this.plugin.check_qmd_response(this.connection, '2f');
        test.equal(DENYSOFT, r[0]);
        test.done();
    },
    'f1' : function (test) {
        test.expect(1);
        var r = this.plugin.check_qmd_response(this.connection, 'f1');
        test.equal(OK, r[0]);
        test.done();
    },
    'f2' : function (test) {
        test.expect(1);
        var r = this.plugin.check_qmd_response(this.connection, 'f2');
        test.equal(OK, r[0]);
        test.done();
    },
    'f3' : function (test) {
        test.expect(1);
        var r = this.plugin.check_qmd_response(this.connection, 'f3');
        test.equal(OK, r[0]);
        test.done();
    },
    'f4' : function (test) {
        test.expect(1);
        var r = this.plugin.check_qmd_response(this.connection, 'f4');
        test.equal(OK, r[0]);
        test.done();
    },
    'f5' : function (test) {
        test.expect(1);
        var r = this.plugin.check_qmd_response(this.connection, 'f5');
        test.equal(OK, r[0]);
        test.done();
    },
    'f6' : function (test) {
        test.expect(1);
        var r = this.plugin.check_qmd_response(this.connection, 'f6');
        test.equal(OK, r[0]);
        test.done();
    },
    'fe' : function (test) {
        test.expect(1);
        var r = this.plugin.check_qmd_response(this.connection, 'fe');
        test.equal(DENYSOFT, r[0]);
        test.done();
    },
    'ff' : function (test) {
        test.expect(1);
        var r = this.plugin.check_qmd_response(this.connection, 'ff');
        test.equal(DENY, r[0]);
        test.done();
    },
    '0' : function (test) {
        test.expect(2);
        var r = this.plugin.check_qmd_response(this.connection, '0');
        test.equal(DENY, r[0]);
        test.equal('not deliverable', r[1]);
        test.done();
    },
    'blah' : function (test) {
        test.expect(1);
        var r = this.plugin.check_qmd_response(this.connection, 'blah');
        test.equal(undefined, r[0]);
        test.done();
    },
};

