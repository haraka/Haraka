
var stub             = require('../fixtures/stub'),
    Connection       = require('../fixtures/stub_connection'),
    Plugin           = require('../fixtures/stub_plugin');

function _set_up(callback) {
    this.backup = {};

    // needed for tests
    this.plugin = new Plugin('connect.asn');
    this.plugin.cfg = { main: {} };
    this.connection = Connection.createConnection();

    callback();
}
function _tear_down(callback) {
    callback();
}

exports.parse_monkey = {
    setUp : _set_up,
    tearDown : _tear_down,

    '15169/23': function (test) {
        test.expect(1);
        test.deepEqual(
                {   net: '74.125.44.0/23', asn: '15169', org: 'Google Inc.',
                    date: '2000-03-30', country: undefined},
                this.plugin.parse_monkey(
                    '74.125.44.0/23 | AS15169 | Google Inc. | 2000-03-30')
                );
        test.done();
    },
    '15169/16': function (test) {
        test.expect(1);
        test.deepEqual(
                {   net: '74.125.0.0/16', asn: '15169', org: 'Google Inc.',
                    date: '2000-03-30', country: 'US'},
                this.plugin.parse_monkey(
                    '74.125.0.0/16 | AS15169 | Google Inc. | 2000-03-30 | US')
                );
        test.done();
    },
};

exports.parse_routeviews = {
    setUp : _set_up,
    tearDown : _tear_down,

    '40431 string, asn-only': function (test) {
        test.expect(1);
        test.equal(
                undefined,
                this.plugin.parse_routeviews('40431')
                );
        test.done();
    },
    '40431 string': function (test) {
        test.expect(1);
        test.deepEqual(
                {asn: '40431', net: '208.75.176.0/21'},
                this.plugin.parse_routeviews('40431 208.75.176.0 21')
                );
        test.done();
    },
    '40431 array': function (test) {
        test.expect(1);
        test.deepEqual(
                {asn: '40431', net: '208.75.176.0/21' },
                this.plugin.parse_routeviews(['40431','208.75.176.0','21'])
                );
        test.done();
    },
};

exports.parse_cymru = {
    setUp : _set_up,
    tearDown : _tear_down,

    '40431': function (test) {
        test.expect(1);
        test.deepEqual(
                {   asn: '40431', net: '208.75.176.0/21', country: 'US',
                    assignor: 'arin', date: '2007-03-02' },
                this.plugin.parse_cymru(
                    '40431 | 208.75.176.0/21 | US | arin | 2007-03-02')
                );
        test.done();
    },
    '10290': function (test) {
        test.expect(1);
        test.deepEqual(
                {   asn: '10290', net: '12.129.48.0/24', country: 'US',
                    assignor: 'arin', date: ''},
                this.plugin.parse_cymru(
                    '10290 | 12.129.48.0/24 | US | arin |')
                );
        test.done();
    },
};

exports.get_dns_results = {
    setUp : _set_up,
    tearDown : _tear_down,

    'origin.asn.cymru.com': function (test) {
        var cb = function (err, zone, obj) {
            if (obj) {
                test.expect(3);
                test.equal('origin.asn.cymru.com', zone);
                test.equal('15169', obj.asn);
                test.equal('8.8.8.0/24', obj.net);
            }
            else {
                test.expect(1);
                test.equal('something', obj);
            }
            test.done();
        };
        this.plugin.get_dns_results('origin.asn.cymru.com', '8.8.8.8', cb);
    },
    'asn.routeviews.org': function (test) {
        var cb = function (err, zone, obj) {
            if (obj) {
                test.expect(2);
                test.equal('asn.routeviews.org', zone);
                if (obj.asn && obj.asn === '15169') {
                    test.equal('15169', obj.asn);
                }
            }
            else {
                test.expect(1);
                test.ok("Node DNS (c-ares) bug");
            }
            test.done();
        };
        this.plugin.get_dns_results('asn.routeviews.org', '8.8.8.8', cb);
    },
    'origin.asn.spameatingmonkey.net': function (test) {
        var cb = function (err, zone, obj) {
            if (obj) {
                test.expect(3);
                test.equal('origin.asn.spameatingmonkey.net', zone);
                test.equal('15169', obj.asn);
                test.equal('US', obj.country);
            }
            else {
                test.expect(1);
                test.equal('something', obj);
            }
            test.done();
        };
        this.plugin.get_dns_results(
                'origin.asn.spameatingmonkey.net',
                '8.8.8.8',
                cb
                );
    },
};
