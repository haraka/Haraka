
var stub             = require('../fixtures/stub'),
    Connection       = require('../fixtures/stub_connection'),
    Plugin           = require('../fixtures/stub_plugin'),
    configfile       = require('../../configfile'),
    config           = require('../../config'),
    // Header       = require('../../mailheader').Header,
    ResultStore      = require("../../result_store");

function _set_up(callback) {
    this.backup = {};

    this.plugin = Plugin('connect.geoip');
    this.plugin.config = config;
    this.plugin.cfg = { main: {} };

    try {
        this.plugin.geoip = require('geoip-lite');
    }
    catch (e) {
    }

    this.connection = Connection.createConnection();
    this.connection.results = new ResultStore(this.plugin);

    callback();
}
function _tear_down(callback) {
    callback();
}

// ServedBy ll: [ 47.6738, -122.3419 ],
// WMISD  [ 38, -97 ]

exports.haversine = {
    setUp : _set_up,
    tearDown : _tear_down,
    'WA to MI': function (test) {
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

    'seattle: ': function (test) {
        var cb = function (rc) {
            test.expect(1);
            test.equal(undefined, rc);
            if (this.plugin.geoip) {
                test.expect(2);
                var r = this.connection.results.get('connect.geoip');
                // console.log(r);
                test.ok(r);
            }
            test.done();
        }.bind(this);
        this.connection.remote_ip='192.48.85.146';
        this.plugin.geoip_lookup(cb, this.connection);
    },
    'michigan: ': function (test) {
        test.expect(2);
        var cb = function (rc) {
            test.expect(1);
            test.equal(undefined, rc);
            if (this.plugin.geoip) {
                test.expect(2);
                var r = this.connection.results.get('connect.geoip');
                // console.log(r);
                test.ok(r);
            }
            test.done();
        }.bind(this);
        this.connection.remote_ip='199.176.179.3';
        this.plugin.geoip_lookup(cb, this.connection);
    },
};
