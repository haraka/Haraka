'use strict';

var stub             = require('../fixtures/stub'),
    Connection       = require('../fixtures/stub_connection'),
    Plugin           = require('../fixtures/stub_plugin'),
    configfile       = require('../../configfile'),
    config           = require('../../config'),
    // Header       = require('../../mailheader').Header,
    ResultStore      = require("../../result_store");

function _set_up(callback) {
    this.plugin = new Plugin('connect.geoip');
    this.plugin.config = config;
    this.plugin.load_geoip_ini();

    this.connection = Connection.createConnection();
    this.connection.results = new ResultStore(this.plugin);

    callback();
}
function _tear_down(callback) {
    callback();
}

exports.register = {
    setUp : function (callback) {
        this.plugin = new Plugin('connect.geoip');
        this.plugin.config = config;

        try { this.plugin.mm_loads = require('maxmind'); }
        catch (ignore) {}
        try { this.plugin.gl_loads = require('geoip-lite'); }
        catch (ignore) {}

        this.plugin.register();
        callback();
    },
    tearDown : _tear_down,
    'config loaded': function (test) {
        test.expect(2);
        test.ok(this.plugin.cfg);
        test.ok(this.plugin.cfg.main);
        test.done();
    },
    'maxmind loaded': function (test) {
        if (this.plugin.mm_loads) {
            test.expect(1);
            test.ok(this.plugin.maxmind);
        }
        test.done();
    },
    'geoip-lite loaded': function (test) {
        if (this.plugin.gl_loads) {
            test.expect(1);
            test.ok(this.plugin.geoip);
        }
        test.done();
    },
};

exports.load_maxmind = {
    setUp : _set_up,
    tearDown : _tear_down,
    'maxmind module loads if installed': function (test) {
        var p = this.plugin;
        if (this.plugin.load_maxmind()) {
            test.expect(1);
            test.ok(p.maxmind);
        }
        test.done();
    },
};

exports.load_geoip_lite = {
    setUp : _set_up,
    tearDown : _tear_down,
    'geoip-lite module loads if installed': function (test) {
        var p = this.plugin;
        if (this.plugin.load_geoip_lite()) {
            test.expect(1);
            test.ok(p.geoip);
        }
        test.done();
    },
};

exports.lookup_maxmind = {
    setUp : function (callback) {
        this.plugin = new Plugin('connect.geoip');
        this.plugin.config = config;
        this.plugin.load_geoip_ini();

        this.connection = Connection.createConnection();
        this.connection.results = new ResultStore(this.plugin);

        this.plugin.load_maxmind();
        callback();
    },
    tearDown : _tear_down,
    'servedby.tnpi.net': function (test) {
        var cb = function() {
            if (this.plugin.maxmind && this.plugin.maxmind.dbsLoaded) {
                test.expect(4);
                var r = this.connection.results.get('connect.geoip');
                test.equal('53837', r.asn);
                test.equal('ServedBy the Net, LLC.', r.asn_org);
                test.equal('US', r.country);
                test.equal('NA', r.continent);
            }
            test.done();
        }.bind(this);

        this.connection.remote_ip='192.48.85.146';
        this.plugin.cfg.main.calc_distance=true;
        this.plugin.lookup_maxmind(cb, this.connection);
    },
};

// ServedBy ll: [ 47.6738, -122.3419 ],
// WMISD  [ 38, -97 ]

exports.get_geoip = {
    setUp : function (callback) {
        this.plugin = new Plugin('connect.geoip');
        this.plugin.config = config;

        try { this.plugin.mm_loads = require('maxmind'); }
        catch (ignore) {}
        try { this.plugin.gl_loads = require('geoip-lite'); }
        catch (ignore) {}

        this.plugin.register();
        callback();
    },
    tearDown : _tear_down,
    'no IP fails': function (test) {
        if (!this.plugin.hasProvider) { return test.done(); }
        test.expect(1);
        test.ok(!this.plugin.get_geoip());
        test.done();
    },
    'ipv4 private fails': function (test) {
        if (!this.plugin.hasProvider) { return test.done(); }
        test.expect(1);
        test.ok(!this.plugin.get_geoip('192.168.85.146'));
        test.done();
    },
};

exports.lookup_geoip = {
    setUp : function (callback) {
        this.plugin = new Plugin('connect.geoip');
        this.plugin.config = config;
        this.plugin.load_geoip_ini();
        this.connection = Connection.createConnection();
        this.connection.results = new ResultStore(this.plugin);
        this.plugin.load_geoip_lite();
        callback();
    },
    tearDown : _tear_down,
    'seattle: lat + long': function (test) {
        var cb = function (rc) {
            if (this.plugin.geoip) {
                test.expect(3);
                var r = this.connection.results.get('connect.geoip');
                test.equal(47.6738, r.ll[0]);
                test.equal(-122.3419, r.ll[1]);
                test.ok(r);
            }
            test.done();
        }.bind(this);
        this.connection.remote_ip='192.48.85.146';
        this.plugin.lookup_geoip(cb, this.connection);
    },
    'michigan: lat + long': function (test) {
        var cb = function (rc) {
            if (this.plugin.geoip) {
                test.expect(3);
                var r = this.connection.results.get('connect.geoip');
                test.equal(38, r.ll[0]);
                test.equal(-97, r.ll[1]);
                test.ok(r);
            }
            test.done();
        }.bind(this);
        this.connection.remote_ip='199.176.179.3';
        this.plugin.lookup_geoip(cb, this.connection);
    },
};

exports.get_geoip_maxmind = {
    setUp : function (callback) {
        this.plugin = new Plugin('connect.geoip');
        this.plugin.config = config;
        this.plugin.load_geoip_ini();
        var p = this.plugin;
        this.plugin.load_maxmind();
        if (!p.maxmind) {
            p.logerror("maxmind not loaded!");
            return callback();
        }
        if (!p.maxmind.dbsLoaded) {
            p.logerror("no maxmind DBs loaded!");
        }
        callback();
    },
    tearDown : _tear_down,
    'ipv4 public passes': function (test) {
        if (!this.plugin.maxmind) { return test.done(); }
        if (!this.plugin.maxmind.dbsLoaded) { return test.done(); }
        test.expect(1);
        test.ok(this.plugin.get_geoip_maxmind('192.48.85.146'));
        test.done();
    },
    'ipv6 public passes': function (test) {
        if (!this.plugin.maxmind) { return test.done(); }
        if (!this.plugin.maxmind.dbsLoaded) { return test.done(); }
        test.expect(1);
        var r = this.plugin.get_geoip_maxmind('2607:f060:b008:feed::6');
        test.ok(r);
        test.done();
    },
};

exports.get_geoip_lite = {
    setUp : function (callback) {
        this.plugin = new Plugin('connect.geoip');
        this.plugin.config = config;
        this.plugin.load_geoip_ini();
        this.plugin.load_geoip_lite();
        callback();
    },
    tearDown : _tear_down,
    'no IP fails': function (test) {
        if (!this.plugin.geoip) {
            this.plugin.logerror("geoip-lite not loaded!");
            return test.done();
        }
        test.expect(1);
        test.ok(!this.plugin.get_geoip_lite());
        test.done();
    },
    'ipv4 public passes': function (test) {
        if (!this.plugin.geoip) {
            this.plugin.logerror("geoip-lite not loaded!");
            return test.done();
        }
        test.expect(1);
        test.ok(this.plugin.get_geoip_lite('192.48.85.146'));
        test.done();
    },
    'ipv4 private fails': function (test) {
        if (!this.plugin.geoip) {
            this.plugin.logerror("geoip-lite not loaded!");
            return test.done();
        }
        test.expect(1);
        test.ok(!this.plugin.get_geoip_lite('192.168.85.146'));
        test.done();
    },
};

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
        test.done();
    }
};
