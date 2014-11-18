'use strict';

var stub         = require('../fixtures/stub'),
    Plugin       = require('../fixtures/stub_plugin');

function _set_up(callback) {
    this.backup = {};

    // needed for tests
    this.plugin = new Plugin('dns_list_base');

    callback();
}

function _tear_down(callback) {
    callback();
}

exports.disable_zone = {
    setUp : _set_up,
    tearDown : _tear_down,
    'empty request': function (test) {
        test.expect(1);
        var res = this.plugin.disable_zone();
        test.equal(false, res);
        test.done();
    },
    'testbl1, no zones': function (test) {
        test.expect(1);
        var res = this.plugin.disable_zone('testbl1', 'test result');
        test.equal(false, res);
        test.done();
    },
    'testbl1, zones miss': function (test) {
        test.expect(2);
        this.plugin.disable_allowed=true;
        this.plugin.zones = [ 'testbl2' ];
        var res = this.plugin.disable_zone('testbl1', 'test result');
        test.equal(false, res);
        test.equal(1, this.plugin.zones.length);
        test.done();
    },
    'testbl1, zones hit': function (test) {
        test.expect(2);
        this.plugin.disable_allowed=true;
        this.plugin.zones = [ 'testbl1' ];
        var res = this.plugin.disable_zone('testbl1', 'test result');
        test.equal(true, res);
        test.equal(0, this.plugin.zones.length);
        test.done();
    },
};

exports.lookup = {
    setUp : _set_up,
    tearDown : _tear_down,
    'spamcop, test IP': function (test) {
        test.expect(2);
        var cb = function (err, a) {
            test.equal(null, err);
            test.ok(a);
            test.done();
        };
        this.plugin.lookup('127.0.0.2', 'bl.spamcop.net', cb);
    },
    'spamcop, unlisted IP': function (test) {
        test.expect(2);
        var cb = function (err, a) {
            test.equal(null, err);
            test.equal(null, a);
            test.done();
        }.bind(this);
        this.plugin.lookup('127.0.0.1', 'bl.spamcop.net', cb);
    },
};

exports.multi = {
    setUp : _set_up,
    tearDown : _tear_down,
    'spamcop': function (test) {
        test.expect(3);
        var cb = function (err, zone, a, pending) {
            if (pending) {
                test.equal(null, err);
                test.ok(a);
                test.equal(true, pending);
            }
            else {
                test.done();
            }
        };
        this.plugin.multi('127.0.0.2', 'bl.spamcop.net', cb);
    },
    'spamhaus XML': function (test) {
        test.expect(3);
        var cb = function (err, zone, a, pending) {
            if (pending) {
                test.equal(null, err);
                test.ok(a);
                test.equal(true, pending);
            }
            else {
                test.done();
            }
        };
        this.plugin.multi('127.0.0.2', 'xbl.spamhaus.org', cb);
    },
    'spamcop + spamhaus XBL': function (test) {
        test.expect(6);
        var cb = function (err, zone, a, pending) {
            if (pending) {
                test.equal(null, err);
                test.ok(zone);
                test.equal(true, pending);
            }
            else {
                test.done();
            }
        };
        var dnsbls = ['bl.spamcop.net','xbl.spamhaus.org'];
        this.plugin.multi('127.0.0.2', dnsbls, cb);
    },
};
