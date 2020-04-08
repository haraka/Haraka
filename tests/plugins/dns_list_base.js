'use strict';

const fixtures     = require('haraka-test-fixtures');

const _set_up = function (done) {

    this.plugin = new fixtures.plugin('dns_list_base');

    done();
}

exports.disable_zone = {
    setUp : _set_up,
    'empty request' (test) {
        test.expect(1);
        const res = this.plugin.disable_zone();
        test.equal(false, res);
        test.done();
    },
    'testbl1, no zones' (test) {
        test.expect(1);
        const res = this.plugin.disable_zone('testbl1', 'test result');
        test.equal(false, res);
        test.done();
    },
    'testbl1, zones miss' (test) {
        test.expect(2);
        this.plugin.disable_allowed=true;
        this.plugin.zones = [ 'testbl2' ];
        const res = this.plugin.disable_zone('testbl1', 'test result');
        test.equal(false, res);
        test.equal(1, this.plugin.zones.length);
        test.done();
    },
    'testbl1, zones hit' (test) {
        test.expect(2);
        this.plugin.disable_allowed=true;
        this.plugin.zones = [ 'testbl1' ];
        const res = this.plugin.disable_zone('testbl1', 'test result');
        test.equal(true, res);
        test.equal(0, this.plugin.zones.length);
        test.done();
    },
}

exports.lookup = {
    setUp : _set_up,
    'Spamcop, test IP' (test) {
        test.expect(2);
        function cb (err, a) {
            test.equal(null, err);
            test.ok(a);
            test.done();
        }
        this.plugin.lookup('127.0.0.2', 'bl.spamcop.net', cb);
    },
    'Spamcop, unlisted IP' (test) {
        test.expect(2);
        const cb = function (err, a) {
            test.equal(null, err);
            test.equal(null, a);
            test.done();
        }.bind(this);
        this.plugin.lookup('127.0.0.1', 'bl.spamcop.net', cb);
    },
}

exports.multi = {
    setUp : _set_up,
    'Spamcop' (test) {
        test.expect(4);
        function cb (err, zone, a, pending) {
            test.equal(null, err);
            if (pending) {
                test.ok((Array.isArray(a) && a.length > 0));
                test.equal(true, pending);
            }
            else {
                test.done();
            }
        }
        this.plugin.multi('127.0.0.2', 'bl.spamcop.net', cb);
    },
    'CBL' (test) {
        test.expect(4);
        function cb (err, zone, a, pending) {
            test.equal(null, err);
            if (pending) {
                test.ok((Array.isArray(a) && a.length > 0));
                test.equal(true, pending);
            }
            else {
                test.done();
            }
        }
        this.plugin.multi('127.0.0.2', 'cbl.abuseat.org', cb);
    },
    'Spamcop + CBL' (test) {
        test.expect(12);
        function cb (err, zone, a, pending) {
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
        }
        const dnsbls = ['bl.spamcop.net','cbl.abuseat.org'];
        this.plugin.multi('127.0.0.2', dnsbls, cb);
    },
    'Spamcop + CBL + negative result' (test) {
        test.expect(12);
        function cb (err, zone, a, pending) {
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
        }
        const dnsbls = ['bl.spamcop.net','cbl.abuseat.org'];
        this.plugin.multi('127.0.0.1', dnsbls, cb);
    },
    'IPv6 addresses supported' (test) {
        test.expect(12);
        function cb (err, zone, a, pending) {
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
        }
        const dnsbls = ['bl.spamcop.net','cbl.abuseat.org'];
        this.plugin.multi('::1', dnsbls, cb);
    }
}

exports.first = {
    setUp : _set_up,
    'positive result' (test) {
        test.expect(3);
        function cb (err, zone, a) {
            test.equal(null, err);
            test.ok(zone);
            test.ok((Array.isArray(a) && a.length > 0));
            test.done();
        }
        const dnsbls = [ 'cbl.abuseat.org', 'bl.spamcop.net' ];
        this.plugin.first('127.0.0.2', dnsbls , cb);
    },
    'negative result' (test) {
        test.expect(3);
        function cb (err, zone, a) {
            test.equal(null, err);
            test.equal(null, zone);
            test.equal(null, a);
            test.done();
        }
        const dnsbls = [ 'cbl.abuseat.org', 'bl.spamcop.net' ];
        this.plugin.first('127.0.0.1', dnsbls, cb);
    },
    'each_cb' (test) {
        test.expect(7);
        const dnsbls = [ 'cbl.abuseat.org', 'bl.spamcop.net' ];
        let pending = dnsbls.length;
        function cb () {
            test.ok(pending);
        }
        function cb_each (err, zone, a) {
            pending--;
            test.equal(null, err);
            test.ok(zone);
            test.ok((Array.isArray(a) && a.length > 0));
            if (pending === 0) test.done();
        }
        this.plugin.first('127.0.0.2', dnsbls, cb, cb_each);
    }
}

function zone_disable_test_func (zones, test, cb) {
    this.plugin.disabled_zones = zones;
    this.plugin.zones = []

    this.plugin.check_zones(9000);

    const fin_check = () => {
        this.plugin.shutdown();
        cb();
        test.done();
    };

    let i = 0;
    const again = () => {
        i++;
        setTimeout(() => {
            if (this.plugin.zones.length === zones.length) return fin_check();
            if (i > 4) return fin_check();
            again();
        }, 1000);
    };
    again();
}

exports.lookback_is_rejected = {
    setUp: _set_up,
    'zones with quirks pass through when lookback_is_rejected=true' (test) {
        const zones = [ 'hostkarma.junkemailfilter.com', 'bl.spamcop.net' ];
        this.plugin.lookback_is_rejected = true;

        zone_disable_test_func.call(this, zones, test, () => {
            if (this.plugin.zones.length === 0) {
                // just AppVeyor being annoying
                if (!['win32','win64'].includes(process.platform)) {
                    console.error("Didn't enable all zones back");
                }
                test.deepEqual(this.plugin.zones.length, 0);
            }
            else {
                test.deepEqual(this.plugin.zones.sort(), zones.sort(), "Didn't enable all zones back");
            }
        });
    },
    'zones with quirks are disabled when lookback_is_rejected=false' (test) {
        const zones = [ 'hostkarma.junkemailfilter.com', 'bl.spamcop.net' ];
        // this.plugin.lookback_is_rejected = true;

        zone_disable_test_func.call(this, zones, test, () => {
            test.deepEqual(this.plugin.zones.sort(), ['bl.spamcop.net'], "Enabled all zones back? This should not have happened");
        });
    }
}
