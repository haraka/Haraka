
var stub             = require('../fixtures/stub'),
    Connection       = require('../fixtures/stub_connection'),
    Plugin           = require('../fixtures/stub_plugin'),
    configfile       = require('../../configfile'),
    config           = require('../../config'),
    // Header       = require('../../mailheader').Header,
    ResultStore      = require("../../result_store");

function _set_up(callback) {
    this.plugin = Plugin('connect.geoip');
    this.plugin.config = config;

    this.connection = Connection.createConnection();
    this.connection.results = new ResultStore(this.plugin);

    callback();
}
function _tear_down(callback) {
    callback();
}

exports.register = {
    setUp : _set_up,
    tearDown : _tear_down,
    'maxmind module loaded': function (test) {
        if (this.plugin.maxmind) {
            test.expect(1);
            test.ok(this.plugin.maxmind);
        }
        test.done();
    },
    'geoip-lite module loaded': function (test) {
        if (this.plugin.geoip) {
            test.expect(1);
            test.ok(this.plugin.geoip);
        }
        test.done();
    },
};

exports.load_maxmind = {
    setUp : _set_up,
    tearDown : _tear_down,
    'module registered': function (test) {
        var cb = function () {
            test.expect(1);
            test.ok(this.plugin.maxmind);
            test.done();
        }.bind(this);
        this.plugin.load_geoip_ini();
        this.plugin.load_maxmind(cb);
    },
};

exports.maxmind_lookup = {
    setUp : _set_up,
    tearDown : _tear_down,
    'lookup test': function (test) {

        var cb = function() {
            test.expect(4);
            var r = this.connection.results.get('connect.geoip');
            test.equal('53837', r.asn);
            test.equal('ServedBy the Net, LLC.', r.asn_org);
            test.equal('US', r.country);
            test.equal('NA', r.continent);
            test.done();
        }.bind(this);

        var cbLoad = function () {
            this.connection.remote_ip='192.48.85.146';
            this.plugin.maxmind_lookup(cb, this.connection);
        }.bind(this);

        this.plugin.load_geoip_ini();
        this.plugin.load_maxmind(cbLoad);
    },
};

// ServedBy ll: [ 47.6738, -122.3419 ],
// WMISD  [ 38, -97 ]

exports.haversine = {
    setUp : _set_up,
    tearDown : _tear_down,
    'WA to MI is 2000-2500km': function (test) {
        test.expect(2);
        var r = this.plugin.haversine(47.673, -122.3419, 38, -97);
        test.equal(true, (r > 2000));
        test.equal(true, (r < 2500));
        // console.log(r);
        test.done();
    }
};

exports.geoip_lookup = {
    setUp : _set_up,
    tearDown : _tear_down,

    'seattle: lat + long': function (test) {
        var cb = function (rc) {
            test.expect(1);
            test.equal(undefined, rc);
            if (this.plugin.geoip) {
                test.expect(4);
                var r = this.connection.results.get('connect.geoip');
                test.equal(47.6738, r.ll[0]);
                test.equal(-122.3419, r.ll[1]);
                // console.log(r);
                test.ok(r);
            }
            test.done();
        }.bind(this);
        this.connection.remote_ip='192.48.85.146';
        this.plugin.geoip_lookup(cb, this.connection);
    },
    'michigan: lat + long': function (test) {
        var cb = function (rc) {
            test.expect(1);
            test.equal(undefined, rc);
            if (this.plugin.geoip) {
                test.expect(4);
                var r = this.connection.results.get('connect.geoip');
                test.equal(38, r.ll[0]);
                test.equal(-97, r.ll[1]);
                // console.log(r);
                test.ok(r);
            }
            test.done();
        }.bind(this);
        this.connection.remote_ip='199.176.179.3';
        this.plugin.geoip_lookup(cb, this.connection);
    },
};
