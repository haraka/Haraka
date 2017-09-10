'use strict';

const fixtures     = require('haraka-test-fixtures');

const _set_up = function (done) {

    this.plugin = new fixtures.plugin('dns_list_base');

    done();
};

exports.disable_zone = {
    setUp : _set_up,
    'empty request': function (test) {
        test.expect(1);
        const res = this.plugin.disable_zone();
        test.equal(false, res);
        test.done();
    },
    'testbl1, no zones': function (test) {
        test.expect(1);
        const res = this.plugin.disable_zone('testbl1', 'test result');
        test.equal(false, res);
        test.done();
    },
    'testbl1, zones miss': function (test) {
        test.expect(2);
        this.plugin.disable_allowed=true;
        this.plugin.zones = [ 'testbl2' ];
        const res = this.plugin.disable_zone('testbl1', 'test result');
        test.equal(false, res);
        test.equal(1, this.plugin.zones.length);
        test.done();
    },
    'testbl1, zones hit': function (test) {
        test.expect(2);
        this.plugin.disable_allowed=true;
        this.plugin.zones = [ 'testbl1' ];
        const res = this.plugin.disable_zone('testbl1', 'test result');
        test.equal(true, res);
        test.equal(0, this.plugin.zones.length);
        test.done();
    },
};

exports.lookup = {
    setUp : _set_up,
    'Spamcop, test IP': function (test) {
        test.expect(2);
        const cb = function (err, a) {
            test.equal(null, err);
            test.ok(a);
            test.done();
        };
        this.plugin.lookup('127.0.0.2', 'bl.spamcop.net', cb);
    },
    'Spamcop, unlisted IP': function (test) {
        test.expect(2);
        const cb = function (err, a) {
            test.equal(null, err);
            test.equal(null, a);
            test.done();
        }.bind(this);
        this.plugin.lookup('127.0.0.1', 'bl.spamcop.net', cb);
    },
};

exports.multi = {
    setUp : _set_up,
    'Spamcop': function (test) {
        test.expect(4);
        const cb = function (err, zone, a, pending) {
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
        const cb = function (err, zone, a, pending) {
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
        const cb = function (err, zone, a, pending) {
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
        const dnsbls = ['bl.spamcop.net','cbl.abuseat.org'];
        this.plugin.multi('127.0.0.2', dnsbls, cb);
    },
    'Spamcop + CBL + negative result': function (test) {
        test.expect(12);
        const cb = function (err, zone, a, pending) {
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
        const dnsbls = ['bl.spamcop.net','cbl.abuseat.org'];
        this.plugin.multi('127.0.0.1', dnsbls, cb);
    },
    'IPv6 addresses supported': function (test) {
        test.expect(12);
        const cb = function (err, zone, a, pending) {
            test.equal(null, a);
            if (pending) {
                test.deepEqual(null, err);
                test.equal(true, pending);
                test.ok(zone);
            }
            else {
                test.equal(null, err);
                test.equal(false, pending);
                test.equal(null, zone);
                test.done();
            }
        };
        const dnsbls = ['bl.spamcop.net','cbl.abuseat.org'];
        this.plugin.multi('::1', dnsbls, cb);
    }
};

exports.first = {
    setUp : _set_up,
    'positive result': function (test) {
        test.expect(3);
        const cb = function (err, zone, a) {
            test.equal(null, err);
            test.ok(zone);
            test.ok((Array.isArray(a) && a.length > 0));
            test.done();
        };
        const dnsbls = [ 'cbl.abuseat.org', 'bl.spamcop.net' ];
        this.plugin.first('127.0.0.2', dnsbls , cb);
    },
    'negative result': function (test) {
        test.expect(3);
        const cb = function (err, zone, a) {
            test.equal(null, err);
            test.equal(null, zone);
            test.equal(null, a);
            test.done();
        };
        const dnsbls = [ 'cbl.abuseat.org', 'bl.spamcop.net' ];
        this.plugin.first('127.0.0.1', dnsbls, cb);
    },
    'each_cb': function (test) {
        test.expect(7);
        const dnsbls = [ 'cbl.abuseat.org', 'bl.spamcop.net' ];
        let pending = dnsbls.length;
        const cb = function () {
            test.ok(pending);
        };
        const cb_each = function (err, zone, a) {
            pending--;
            test.equal(null, err);
            test.ok(zone);
            test.ok((Array.isArray(a) && a.length > 0));
            if (pending === 0) test.done();
        };
        this.plugin.first('127.0.0.2', dnsbls, cb, cb_each);
    }
};
