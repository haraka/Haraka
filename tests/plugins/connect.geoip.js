
var stub             = require('../fixtures/stub'),
    Connection       = require('../fixtures/stub_connection'),
    Plugin           = require('../fixtures/stub_plugin'),
    configfile       = require('../../configfile'),
    config           = require('../../config'),
    // Header       = require('../../mailheader').Header,
    ResultStore      = require("../../result_store");

var installed = {};
try { installed.maxmind = require('maxmind'); }
catch (ignore) {}
try { installed.geoip = require('geoip-lite'); }
catch (ignore) {}

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
    'config loaded': function (test) {
        test.expect(2);
        this.plugin.register();
        test.ok(this.plugin.cfg);
        test.ok(this.plugin.cfg.main);
        test.done();
    },
};

exports.load_maxmind = {
    setUp : _set_up,
    tearDown : _tear_down,
    'maxmind module loads if installed': function (test) {
        var loads;
        try { loads = require('maxmind'); }
        catch (ignore) {}
        var cb = function () {
            if (loads) {
                test.expect(1);
                test.ok(this.plugin.maxmind);
            }
            test.done();
        }.bind(this);
        this.plugin.load_geoip_ini();
        this.plugin.load_maxmind(cb);
    },
};

exports.load_geoip_lite = {
    setUp : _set_up,
    tearDown : _tear_down,
    'geoip-lite module loads if installed': function (test) {
        if (installed.geoip) {
            test.expect(1);
            test.ok(this.plugin.geoip);
        }
        test.done();
    },
};

exports.lookup_maxmind = {
    setUp : _set_up,
    tearDown : _tear_down,
    'servedby.tnpi.net': function (test) {
        var cb = function() {
            if (installed.maxmind && this.plugin.db_loaded) {
                test.expect(4);
                var r = this.connection.results.get('connect.geoip');
// console.log(r);
                test.equal('53837', r.asn);
                test.equal('ServedBy the Net, LLC.', r.asn_org);
                test.equal('US', r.country);
                test.equal('NA', r.continent);
            }
            test.done();
        }.bind(this);

        var cbLoad = function () {
            this.connection.remote_ip='192.48.85.146';
            this.plugin.lookup_maxmind(cb, this.connection);
        }.bind(this);

        this.plugin.load_geoip_ini();
        this.plugin.cfg.main.calc_distance=true;
        this.plugin.load_maxmind(cbLoad);
    },
};

// ServedBy ll: [ 47.6738, -122.3419 ],
// WMISD  [ 38, -97 ]

exports.calculate_distance = {
    setUp : _set_up,
    tearDown : _tear_down,
    'seattle to michigan': function (test) {
        this.plugin.register();
        if (!this.plugin.db_loaded) {
            return test.done();
        }
        this.plugin.cfg.main.calc_distance=true;
        this.plugin.local_ip='192.48.85.146';
        this.connection.remote_ip='199.176.179.3';
        this.plugin.calculate_distance(this.connection, [38, -97], function (err, d) {
            test.expect(1);
            test.ok(d);
            test.done();
        });
    },
};

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

exports.lookup_geoip = {
    setUp : _set_up,
    tearDown : _tear_down,
    'seattle: lat + long': function (test) {
        var cb = function (rc) {
            if (installed.geoip) {
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
        this.plugin.lookup_geoip(cb, this.connection);
    },
    'michigan: lat + long': function (test) {
        var cb = function (rc) {
            if (installed.geoip) {
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
        this.plugin.lookup_geoip(cb, this.connection);
    },
};
