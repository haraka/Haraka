'use strict';

const fixtures     = require('haraka-test-fixtures');
const dns          = require('dns');

const _set_up = function (done) {

    this.plugin = new fixtures.plugin('mail_from.is_resolvable');
    this.plugin.register();

    this.connection = fixtures.connection.createConnection();

    this.connection.transaction = {
        notes: {},
        results: new fixtures.results(this.plugin),
    };

    done();
};

exports.mxErr = {
    setUp : _set_up,
    'any.com, no err code': function (test) {
        test.expect(3);
        const t = this;
        const txn = t.connection.transaction;
        const err = new Error('oops');
        err.code = null;
        let called = false;
        const cb = function () { called = true; };
        const r  = t.plugin.mxErr(t.connection, 'any.com', 'MX', err, cb);
        test.equal(r, true);
        test.equal(called, true);
        const mf = txn.results.get('mail_from.is_resolvable');
        test.equal(mf.msg[0], 'any.com:MX:oops');
        test.done();
    },
    'any.com, bypass err code': function (test) {
        test.expect(3);
        const t = this;
        const txn = t.connection.transaction;
        const err = new Error('oops');
        err.code=dns.NOTFOUND;
        let called = false;
        const cb = function () { called = true; };
        const r  = t.plugin.mxErr(t.connection, 'any.com', 'MX', err, cb);
        test.equal(r, false);
        test.equal(called, false);
        const mf = txn.results.get('mail_from.is_resolvable');
        test.equal(mf.msg[0], 'any.com:MX:oops');
        test.done();
    }
};

exports.implicit_mx = {
    setUp : _set_up,
    'tnpi.net': function (test) {
        test.expect(2);
        const t = this;
        const txn = this.connection.transaction;
        t.plugin.implicit_mx(t.connection, 'tnpi.net', function (err) {
            test.equal(err, undefined);
            const mf = txn.results.get('mail_from.is_resolvable');
            test.equal(mf.pass.length, 1);
            test.done();
        });
    },
    'harakamail.com': function (test) {
        test.expect(1);
        const t = this;
        const txn = this.connection.transaction;
        t.plugin.implicit_mx(t.connection, 'harakamail.com', function () {
            // console.log(arguments);
            const mf = txn.results.get('mail_from.is_resolvable');
            // console.log(mf);
            test.equal(mf.pass.length, 1);
            test.done();
        });
    },
    'mx.theartfarm.com': function (test) {
        test.expect(1);
        const t = this;
        const txn = this.connection.transaction;
        t.plugin.implicit_mx(t.connection, 'mx.theartfarm.com', function () {
            const mf = txn.results.get('mail_from.is_resolvable');
            // console.log(mf);
            test.equal(mf.fail.length, 1);
            test.done();
        });
    },
    'mxs4am.josef-froehle.de': function (test) {
        test.expect(1);
        const t = this;
        const txn = this.connection.transaction;
        t.plugin.implicit_mx(t.connection, 'mxs4am.josef-froehle.de', function () {
            //console.log(arguments);
            const mf = txn.results.get('mail_from.is_resolvable');
            //console.log(mf);
            test.equal(mf.pass.length, 1);
            test.done();
        });
    },
    'mxs4am-a.josef-froehle.de': function (test) {
        test.expect(1);
        const t = this;
        const txn = this.connection.transaction;
        t.plugin.implicit_mx(t.connection, 'mxs4am-a.josef-froehle.de', function () {
            //console.log(arguments);
            const mf = txn.results.get('mail_from.is_resolvable');
            //console.log(mf);
            test.equal(mf.pass.length, 1);
            test.done();
        });
    },
    'mxs4am-aaaa.josef-froehle.de': function (test) {
        test.expect(1);
        const t = this;
        const txn = this.connection.transaction;
        t.plugin.implicit_mx(t.connection, 'mxs4am-aaaa.josef-froehle.de', function () {
            //console.log(arguments);
            const mf = txn.results.get('mail_from.is_resolvable');
            //console.log(mf);
            test.equal(mf.pass.length, 1);
            test.done();
        });
    },
    'resolve-fail-definitive.josef-froehle.de': function (test) {
        test.expect(1);
        const t = this;
        const txn = this.connection.transaction;
        t.plugin.implicit_mx(t.connection, 'resolve-fail-definitive.josef-froehle.de', function () {
            const mf = txn.results.get('mail_from.is_resolvable');
            //console.log(mf);
            test.equal(mf.fail.length, 1);
            test.done();
        });
    },
    'resolve-fail-a.josef-froehle.de': function (test) {
        test.expect(1);
        const t = this;
        const txn = this.connection.transaction;
        t.plugin.implicit_mx(t.connection, 'resolve-fail-a.josef-froehle.de', function () {
            const mf = txn.results.get('mail_from.is_resolvable');
            //console.log(mf);
            test.equal(mf.fail.length, 1);
            test.done();
        });
    },
    'resolve-fail-aaaa.josef-froehle.de': function (test) {
        test.expect(1);
        const t = this;
        const txn = this.connection.transaction;
        t.plugin.implicit_mx(t.connection, 'resolve-fail-aaaa.josef-froehle.de', function () {
            const mf = txn.results.get('mail_from.is_resolvable');
            //console.log(mf);
            test.equal(mf.fail.length, 1);
            test.done();
        });
    },
};

