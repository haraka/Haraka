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
    'Spamcop, test IP': function (test) {
        test.expect(2);
        var cb = function (err, a) {
            test.equal(null, err);
            test.ok(a);
            test.done();
        };
        this.plugin.lookup('127.0.0.2', 'bl.spamcop.net', cb);
    },
    'Spamcop, unlisted IP': function (test) {
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
    'Spamcop': function (test) {
        test.expect(4);
        var cb = function (err, zone, a, pending) {
            test.equal(null, err);
            if (pending) {
                test.ok((Array.isArray(a) && a.length > 0));
                test.equal(true, pending);
            }
            else {
                test.done();
            }
        };
        this.plugin.multi('127.0.0.2', 'bl.spamcop.net', cb);
    },
    'CBL': function (test) {
        test.expect(4);
        var cb = function (err, zone, a, pending) {
            test.equal(null, err);
            if (pending) {
                test.ok((Array.isArray(a) && a.length > 0));
                test.equal(true, pending);
            }
            else {
                test.done();
            }
        };
        this.plugin.multi('127.0.0.2', 'cbl.abuseat.org', cb);
    },
    'Spamcop + CBL': function (test) {
        test.expect(12);
        var cb = function (err, zone, a, pending) {
            test.equal(null, err);
            if (pending) {
                test.ok(zone);
                test.ok((Array.isArray(a) && a.length > 0));
                test.equal(true, pending);
            }
            else {
                test.equal(null, zone);
                test.equal(null, a);
                test.equal(false, pending);
                test.done();
            }
        };
        var dnsbls = ['bl.spamcop.net','cbl.abuseat.org'];
        this.plugin.multi('127.0.0.2', dnsbls, cb);
    },
    'Spamcop + CBL + negative result': function (test) {
        test.expect(12);
        var cb = function (err, zone, a, pending) {
            test.equal(null, err);
            test.equal(null, a);
            if (pending) {
                test.equal(true, pending);
                test.ok(zone);
            }
            else {
                test.equal(false, pending);
                test.equal(null, zone);
                test.done();
            }
        };
        var dnsbls = ['bl.spamcop.net','cbl.abuseat.org'];
        this.plugin.multi('127.0.0.1', dnsbls, cb);
    }
};

exports.first = {
    setUp : _set_up,
    tearDown : _tear_down,
    'positive result': function (test) {
        test.expect(3);
        var cb = function (err, zone, a) {
            test.equal(null, err);
            test.ok(zone);
            test.ok((Array.isArray(a) && a.length > 0));
            test.done();
        }
        var dnsbls = [ 'cbl.abuseat.org', 'bl.spamcop.net' ];
        this.plugin.first('127.0.0.2', dnsbls , cb);
    },
    'negative result': function (test) {
        test.expect(3);
        var cb = function (err, zone, a) {
            test.equal(null, err);
            test.equal(null, zone);
            test.equal(null, a);
            test.done();
        }
        var dnsbls = [ 'cbl.abuseat.org', 'bl.spamcop.net' ];
        this.plugin.first('127.0.0.1', dnsbls, cb);
    },
    'each_cb': function (test) {
        test.expect(7);
        var dnsbls = [ 'cbl.abuseat.org', 'bl.spamcop.net' ];
        var pending = dnsbls.length;
        var cb = function () {
            test.ok(pending);
        }
        var cb_each = function (err, zone, a) {
            pending--;
            test.equal(null, err);
            test.ok(zone);
            test.ok((Array.isArray(a) && a.length > 0));
            if (pending === 0) test.done(); 
        }
        this.plugin.first('127.0.0.2', dnsbls, cb, cb_each);
    }
}
