'use strict';

var stub         = require('../fixtures/stub'),
    Plugin       = require('../fixtures/stub_plugin'),
    Connection   = require('../fixtures/stub_connection'),
    config       = require('../../config'),
    ResultStore  = require('../../result_store');

var _set_up = function (done) {
    
    this.plugin = new Plugin('mail_from.is_resolvable');
    this.plugin.config = config;
    this.plugin.register();

    this.connection = Connection.createConnection();

    this.connection.transaction = { notes: {} };
    this.connection.transaction.results = new ResultStore(this.plugin);

    done();
};

exports.mxErr = {
    setUp : _set_up,
    'any.com, no err code': function (test) {
        test.expect(3);
        var t = this;
        var txn = t.connection.transaction;
        var err = new Error('oops');
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
        err.code='ENOTFOUND';
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
};

