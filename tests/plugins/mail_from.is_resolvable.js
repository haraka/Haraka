'use strict';

var fixtures     = require('haraka-test-fixtures');
var dns          = require('dns');
var Connection   = fixtures.connection;
var ResultStore  = fixtures.result_store;

var _set_up = function (done) {

    this.plugin = new fixtures.plugin('mail_from.is_resolvable');
    this.plugin.register();

    this.connection = Connection.createConnection();

    this.connection.transaction = {
        notes: {},
        results: new ResultStore(this.plugin),
    };

    done();
};

exports.mxErr = {
    setUp : _set_up,
    'any.com, no err code': function (test) {
        test.expect(3);
        var t = this;
        var txn = t.connection.transaction;
        var err = new Error('oops');
        err.code = null;
        var called = false;
        var cb = function () { called = true; };
        var r  = t.plugin.mxErr(t.connection, 'any.com', 'MX', err, cb);
        test.equal(r, true);
        test.equal(called, true);
        var mf = txn.results.get('mail_from.is_resolvable');
        test.equal(mf.msg[0], 'any.com:MX:oops');
        test.done();
    },
    'any.com, bypass err code': function (test) {
        test.expect(3);
        var t = this;
        var txn = t.connection.transaction;
        var err = new Error('oops');
        err.code=dns.NOTFOUND;
        var called = false;
        var cb = function () { called = true; };
        var r  = t.plugin.mxErr(t.connection, 'any.com', 'MX', err, cb);
        test.equal(r, false);
        test.equal(called, false);
        var mf = txn.results.get('mail_from.is_resolvable');
        test.equal(mf.msg[0], 'any.com:MX:oops');
        test.done();
    }
};

exports.implicit_mx = {
    setUp : _set_up,
    'tnpi.net': function (test) {
        test.expect(2);
        var t = this;
        var txn = this.connection.transaction;
        t.plugin.implicit_mx(t.connection, 'tnpi.net', function (err) {
            test.equal(err, undefined);
            var mf = txn.results.get('mail_from.is_resolvable');
            test.equal(mf.pass.length, 1);
            test.done();
        });
    },
    'harakamail.com': function (test) {
        test.expect(1);
        var t = this;
        var txn = this.connection.transaction;
        t.plugin.implicit_mx(t.connection, 'harakamail.com', function () {
            // console.log(arguments);
            var mf = txn.results.get('mail_from.is_resolvable');
            // console.log(mf);
            test.equal(mf.pass.length, 1);
            test.done();
        });
    },
    'mx.theartfarm.com': function (test) {
        test.expect(1);
        var t = this;
        var txn = this.connection.transaction;
        t.plugin.implicit_mx(t.connection, 'mx.theartfarm.com', function () {
            var mf = txn.results.get('mail_from.is_resolvable');
            // console.log(mf);
            test.equal(mf.fail.length, 1);
            test.done();
        });
    },
    'mxs4am.josef-froehle.de': function (test) {
        test.expect(1);
        var t = this;
        var txn = this.connection.transaction;
        t.plugin.implicit_mx(t.connection, 'mxs4am.josef-froehle.de', function () {
            //console.log(arguments);
            var mf = txn.results.get('mail_from.is_resolvable');
            //console.log(mf);
            test.equal(mf.pass.length, 1);
            test.done();
        });
    },
    'mxs4am-a.josef-froehle.de': function (test) {
        test.expect(1);
        var t = this;
        var txn = this.connection.transaction;
        t.plugin.implicit_mx(t.connection, 'mxs4am-a.josef-froehle.de', function () {
            //console.log(arguments);
            var mf = txn.results.get('mail_from.is_resolvable');
            //console.log(mf);
            test.equal(mf.pass.length, 1);
            test.done();
        });
    },
    'mxs4am-aaaa.josef-froehle.de': function (test) {
        test.expect(1);
        var t = this;
        var txn = this.connection.transaction;
        t.plugin.implicit_mx(t.connection, 'mxs4am-aaaa.josef-froehle.de', function () {
            //console.log(arguments);
            var mf = txn.results.get('mail_from.is_resolvable');
            //console.log(mf);
            test.equal(mf.pass.length, 1);
            test.done();
        });
    },
    'resolve-fail-definitive.josef-froehle.de': function (test) {
        test.expect(1);
        var t = this;
        var txn = this.connection.transaction;
        t.plugin.implicit_mx(t.connection, 'resolve-fail-definitive.josef-froehle.de', function () {
            var mf = txn.results.get('mail_from.is_resolvable');
            //console.log(mf);
            test.equal(mf.fail.length, 1);
            test.done();
        });
    },
    'resolve-fail-a.josef-froehle.de': function (test) {
        test.expect(1);
        var t = this;
        var txn = this.connection.transaction;
        t.plugin.implicit_mx(t.connection, 'resolve-fail-a.josef-froehle.de', function () {
            var mf = txn.results.get('mail_from.is_resolvable');
            //console.log(mf);
            test.equal(mf.fail.length, 1);
            test.done();
        });
    },
    'resolve-fail-aaaa.josef-froehle.de': function (test) {
        test.expect(1);
        var t = this;
        var txn = this.connection.transaction;
        t.plugin.implicit_mx(t.connection, 'resolve-fail-aaaa.josef-froehle.de', function () {
            var mf = txn.results.get('mail_from.is_resolvable');
            //console.log(mf);
            test.equal(mf.fail.length, 1);
            test.done();
        });
    },
};

