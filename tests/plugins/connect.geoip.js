'use strict';

var fixtures     = require('haraka-test-fixtures');

var Connection   = fixtures.connection;

var _set_up = function (done) {
    this.plugin = new fixtures.plugin('connect.geoip');
    this.plugin.load_geoip_ini();
    this.connection = Connection.createConnection();
    done();
};

exports.register = {
    setUp : function (done) {
        this.plugin = new fixtures.plugin('connect.geoip');

        try { this.plugin.mm_loads = require('maxmind'); }
        catch (ignore) {}
        try { this.plugin.gl_loads = require('geoip-lite'); }
        catch (ignore) {}

        this.plugin.register();
        done();
    },
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
    setUp : function (done) {
        this.plugin = new fixtures.plugin('connect.geoip');
        this.plugin.load_geoip_ini();

        this.connection = Connection.createConnection();

        this.plugin.load_maxmind();
        done();
    },
    'servedby.tnpi.net': function (test) {
        var cb = function() {
            if (this.plugin.maxmind && this.plugin.maxmind.dbsLoaded) {
                test.expect(3);
                var r = this.connection.results.get('connect.geoip');
                test.equal('53837', r.asn);
                test.equal('US', r.country);
                test.equal('NA', r.continent);
                if (r.asn_org) {
                    test.expect(4);
                    test.equal('ServedBy the Net, LLC.', r.asn_org);
                }
            }
            test.done();
        }.bind(this);

        this.connection.remote.ip='192.48.85.146';
        this.plugin.cfg.main.calc_distance=true;
        this.plugin.lookup_maxmind(cb, this.connection);
    },
};

// ServedBy ll: [ 47.6738, -122.3419 ],
// WMISD  [ 38, -97 ]

exports.get_geoip = {
    setUp : function (done) {
        this.plugin = new fixtures.plugin('connect.geoip');

        try { this.plugin.mm_loads = require('maxmind'); }
        catch (ignore) {}
        try { this.plugin.gl_loads = require('geoip-lite'); }
        catch (ignore) {}

        this.plugin.register();
        done();
    },
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
    setUp : function (done) {
        this.plugin = new fixtures.plugin('connect.geoip');
        this.plugin.load_geoip_ini();
        this.connection = Connection.createConnection();
        this.plugin.load_geoip_lite();
        done();
    },
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
        this.connection.remote.ip='192.48.85.146';
        this.plugin.lookup_geoip(cb, this.connection);
    },
    'michigan: lat + long': function (test) {
        var cb = function (rc) {
            if (this.plugin.geoip) {
                test.expect(3);
                var r = this.connection.results.get('connect.geoip');
                test.equal(44.0387, r.ll[0]);
                test.equal(-84.8414, r.ll[1]);
                test.ok(r);
            }
            test.done();
        }.bind(this);
        this.connection.remote.ip='199.176.179.3';
        this.plugin.lookup_geoip(cb, this.connection);
    },
};

exports.get_geoip_maxmind = {
    setUp : function (done) {
        this.plugin = new fixtures.plugin('connect.geoip');
        this.plugin.load_geoip_ini();
        var p = this.plugin;
        this.plugin.load_maxmind();
        if (!p.maxmind) {
            p.logerror("maxmind not loaded!");
            return done();
        }
        if (!p.maxmind.dbsLoaded) {
            p.logerror("no maxmind DBs loaded!");
        }
        done();
    },
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
    setUp : function (done) {
        this.plugin = new fixtures.plugin('connect.geoip');
        this.plugin.load_geoip_ini();
        this.plugin.load_geoip_lite();
        done();
    },
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
    'seattle to michigan': function (test) {
        this.plugin.register();
        if (!this.plugin.db_loaded) {
            return test.done();
        }
        this.plugin.cfg.main.calc_distance=true;
        this.plugin.local.ip='192.48.85.146';
        this.connection.remote.ip='199.176.179.3';
        this.plugin.calculate_distance(
                this.connection,
                [38, -97],
                function (err, d) {
                    test.expect(1);
                    test.ok(d);
                    test.done();
                });
    },
};

exports.haversine = {
    setUp : _set_up,
    'WA to MI is 2000-2500km': function (test) {
        test.expect(2);
        var r = this.plugin.haversine(47.673, -122.3419, 38, -97);
        test.equal(true, (r > 2000));
        test.equal(true, (r < 2500));
        test.done();
    }
};
