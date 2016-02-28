'use strict';

var fixtures     = require('haraka-test-fixtures');

var _set_up = function (done) {

    this.plugin = new fixtures.plugin('early_talker');
    this.plugin.cfg = { main: { reject: true } };

    this.connection = fixtures.connection.createConnection();
    done();
};

function _tear_down(done) { done(); }

exports.early_talker = {
    setUp : _set_up,
    tearDown : _tear_down,
    'no config': function (test) {
        test.expect(2);
        var next = function (rc, msg) {
            test.equal(undefined, rc);
            test.equal(undefined, msg);
            test.done();
        }.bind(this);
        this.plugin.early_talker(next, this.connection);
    },
    'relaying': function (test) {
        test.expect(2);
        var next = function (rc, msg) {
            test.equal(undefined, rc);
            test.equal(undefined, msg);
            test.done();
        }.bind(this);
        this.plugin.pause = 1;
        this.connection.relaying = true;
        this.plugin.early_talker(next, this.connection);
    },
    'is an early talker': function (test) {
        test.expect(3);
        var before = Date.now();
        var next = function (rc, msg) {
            test.ok(Date.now() >= before + 1000);
            test.equal(DENYDISCONNECT, rc);
            test.equal('You talk too soon', msg);
            test.done();
        }.bind(this);
        this.plugin.pause = 1000;
        this.connection.early_talker = true;
        this.plugin.early_talker(next, this.connection);
    },
    'is an early talker, reject=false': function (test) {
        test.expect(4);
        var before = Date.now();
        var next = function (rc, msg) {
            test.ok(Date.now() >= before + 1000);
            test.equal(undefined, rc);
            test.equal(undefined, msg);
            test.ok(this.connection.results.has('early_talker', 'fail', 'early'));
            test.done();
        }.bind(this);
        this.plugin.pause = 1001;
        this.plugin.cfg.main.reject = false;
        this.connection.early_talker = true;
        this.plugin.early_talker(next, this.connection);
    },
};
