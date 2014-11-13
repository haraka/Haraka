'use strict';

var async     = require('async');
var fs        = require('fs');
var net       = require('net');
var net_utils = require('./net_utils');

exports.register = function () {
    var plugin = this;

    plugin.load_geoip_ini();

    plugin.load_maxmind(function () {
        plugin.load_geoip_lite();
    });
};

exports.load_geoip_ini = function () {
    var plugin = this;
    plugin.cfg = plugin.config.get('connect.geoip.ini', {
            booleans: [
                '+main.show_city',
                '+main.show_region',
                '-main.calc_distance',
            ],
        },
        plugin.load_geoip_ini
    );
};

exports.load_maxmind = function (loadDone) {
    var plugin = this;

    try {
        plugin.maxmind = require('maxmind');
    }
    catch (e) {
        plugin.logerror(e);
        plugin.logerror("unable to load maxmind, try\n\n\t'npm install -g maxmind'\n\n");
        if (loadDone) loadDone();
        return;
    }

    var dbs = ['GeoIPCity', 'GeoIP', 'GeoIPv6',  'GeoIPASNum', 'GeoISP',
               'GeoIPNetSpeedCell',  'GeoIPOrg', 'GeoLiteCityV6'];
    var dbsFound = [];

    var fsDone = function (err) {
        if (err) { plugin.logerror(err); }
        plugin.maxmind.dbsLoaded=dbsFound.length;
        if (dbsFound.length === 0) {
            plugin.logerror('no GeoIP DBs found');
            if (loadDone) loadDone();
            return;
        }
        plugin.db_loaded=true;
        plugin.maxmind.init(dbsFound, {indexCache: true, checkForUpdates: true});
        plugin.register_hook('connect',     'lookup_maxmind');
        plugin.register_hook('data_post',   'add_geoip_headers');
        if (loadDone) loadDone();
    };

    var dbdir = plugin.cfg.main.dbdir || '/usr/local/share/GeoIP/';
    var fsIter = function (file, iterDone) {
        var path = dbdir + file + '.dat';

        fs.exists(path, function (exists) {
            if (!exists) return iterDone();
            dbsFound.push(path);
            iterDone();
        });
    };

    async.each(dbs, fsIter, fsDone);
};

exports.load_geoip_lite = function () {
    var plugin = this;
    if (plugin.db_loaded) return;

    try {
        plugin.geoip = require('geoip-lite');
    }
    catch (e) {
        plugin.logerror(e);
        plugin.logerror("unable to load geoip-lite, try\n\n\t'npm install -g geoip-lite'\n\n");
        return;
    }

    if (!plugin.geoip) {
        // geoip-lite dropped node 0.8 support, it may not have loaded
        plugin.logerror('unable to load geoip-lite');
        return;
    }

    plugin.db_loaded=true;
    plugin.register_hook('connect',     'lookup_geoip');
    plugin.register_hook('data_post',   'add_geoip_headers');
};

exports.lookup_maxmind = function (next, connection) {
    var plugin = this;

    if (!plugin.maxmind) { return next(); }
    if (!plugin.maxmind.dbsLoaded) { return next(); }

    var ip = connection.remote_ip;
    var show = [];
    var loc = plugin.get_geoip_maxmind(ip);
    if (loc) {
        connection.results.add(plugin, {continent: loc.continentCode});
        connection.results.add(plugin, {country: loc.countryCode || loc.code});
        show.push(loc.continentCode);
        show.push(loc.countryCode);
        if (loc.city) {
            connection.results.add(plugin, {region: loc.region});
            connection.results.add(plugin, {city: loc.city});
            connection.results.add(plugin, {ll: [loc.latitude, loc.longitude]});
            if (plugin.cfg.main.show_region) { show.push(loc.region); }
            if (plugin.cfg.main.show_city  ) { show.push(loc.city); }
        }
    }

    var asn = plugin.maxmind.getAsn(ip);
    if (asn) {
        var match = asn.match(/^(?:AS)([0-9]+)\s+(.*)$/);
        connection.results.add(plugin, {asn: match[1]});
        connection.results.add(plugin, {asn_org: match[2]});
    }

    if (!loc || !plugin.cfg.main.calc_distance) {
        connection.results.add(plugin, {human: show.join(', '), emit:true});
        return next();
    }

    plugin.calculate_distance(connection, [loc.latitude, loc.longitude], function (err, distance) {
        if (err) { connection.results.add(plugin, {err: err}); }
        if (distance) { show.push(distance+'km'); }
        connection.results.add(plugin, {human: show.join(', '), emit:true});
        return next();
    });
};

exports.lookup_geoip = function (next, connection) {
    var plugin = this;

    // geoip.lookup results look like this:
    // range: [ 3479299040, 3479299071 ],
    //    country: 'US',
    //    region: 'CA',
    //    city: 'San Francisco',
    //    ll: [37.7484, -122.4156]

    if (!plugin.geoip) {
        connection.logerror(plugin, "oops, geoip-lite not loaded");
        return next();
    }

    var r = plugin.get_geoip_lite(connection.remote_ip);
    if (!r) { return next(); }

    connection.results.add(plugin, r);

    var show = [ r.country ];
    if (r.region   && plugin.cfg.main.show_region) { show.push(r.region); }
    if (r.city     && plugin.cfg.main.show_city  ) { show.push(r.city); }

    if (!plugin.cfg.main.calc_distance) {
        connection.results.add(plugin, {human: show.join(', '), emit:true});
        return next();
    }

    plugin.calculate_distance(connection, r.ll, function (err, distance) {
        show.push(r.distance+'km');
        connection.results.add(plugin, {human: show.join(', '), emit:true});
        return next();
    });
};

exports.get_geoip = function (ip) {
    var plugin = this;

    var result = plugin.get_geoip_maxmind(ip);
    if (result) return result;

    return plugin.get_geoip_lite(ip);
};

exports.get_geoip_maxmind = function (ip) {
    var plugin = this;
    if (!ip) return;
    if (!plugin.maxmind) return;
    if (net_utils.is_rfc1918(ip)) return;

    var ipv6 = net.isIPv6(ip);

    var result;
    try { result = ipv6 ? plugin.maxmind.getLocationV6(ip) : plugin.maxmind.getLocation(ip); }
    catch (e) { plugin.logerror(e); }
    if (!result) {
        try { result = ipv6 ? plugin.maxmind.getCountryV6(ip) : plugin.maxmind.getCountry(ip); }
        catch (e) { plugin.logerror(e); }
    }
    return result;
};

exports.get_geoip_lite = function (ip) {
    var plugin = this;
    if (!ip) return;
    if (!plugin.geoip) return;
    if (net_utils.is_rfc1918(ip)) return;

    var result = plugin.geoip.lookup(ip);
    if (result && result.ll) {
        result.latitude = result.ll[0];
        result.longitude = result.ll[1];
    }

    return result;
};

exports.add_geoip_headers = function (next, connection) {
    var plugin = this;
    var txn = connection.transaction;
    if (!txn) { return; }
    txn.remove_header('X-Haraka-GeoIP');
    txn.remove_header('X-Haraka-GeoIP-Received');
    var geoip = connection.results.get('connect.geoip');
    if (geoip) {             txn.add_header('X-Haraka-GeoIP',   geoip.human  );
        if (geoip.asn)     { txn.add_header('X-Haraka-ASN',     geoip.asn    ); }
        if (geoip.asn_org) { txn.add_header('X-Haraka-ASN-Org', geoip.asn_org); }
    }

    var received = [];

    var rh = plugin.received_headers(connection);
    if ( rh) { received.push(rh); }
    if (!rh) { plugin.user_agent(connection); } // No received headers.

    var oh = plugin.originating_headers(connection);
    if (oh) { received.push(oh); }

    // Add any received results to a trace header
    if (received.length) {
        txn.add_header('X-Haraka-GeoIP-Received', received.join(' '));
    }
    return next();
};

exports.get_local_geo = function (ip, connection) {
    var plugin = this;
    if (plugin.local_geoip) return;  // cached

    if (!plugin.local_ip) { plugin.local_ip = ip; }
    if (!plugin.local_ip) { plugin.local_ip = plugin.cfg.main.public_ip; }
    if (!plugin.local_ip) {
        connection.logerror(plugin, "can't calculate distance, set public_ip in smtp.ini");
        return;
    }

    if (!plugin.local_geoip) {
         plugin.local_geoip = plugin.get_geoip(plugin.local_ip);
    }

    if (!plugin.local_geoip) {
        connection.logerror(plugin, "no GeoIP results for local_ip!");
    }
};

exports.calculate_distance = function (connection, rll, done) {
    var plugin = this;

    var cb = function (err, l_ip) {
        if (err) {
            connection.results.add(plugin, {err: err});
            connection.logerror(plugin, err);
        }

        plugin.get_local_geo(l_ip, connection);
        if (!plugin.local_ip || !plugin.local_geoip) { return done(); }

        var gl = plugin.local_geoip;
        var gcd = plugin.haversine(gl.latitude, gl.longitude, rll[0], rll[1]);
        connection.results.add(plugin, {distance: gcd});

        if (plugin.cfg.main.too_far && (parseFloat(plugin.cfg.main.too_far) < parseFloat(gcd))) {
            connection.results.add(plugin, {too_far: true});
        }
        done(err, gcd);
    };

    if (plugin.local_ip) return cb(null, plugin.local_ip);
    net_utils.get_public_ip(cb);
};

exports.haversine = function (lat1, lon1, lat2, lon2) {
    // calculate the great circle distance using the haversine formula
    // found here: http://www.movable-type.co.uk/scripts/latlong.html
    var EARTH_RADIUS = 6371; // km
    function toRadians(v) { return v * Math.PI / 180; }
    var deltaLat = toRadians(lat2 - lat1);
    var deltaLon = toRadians(lon2 - lon1);
            lat1 = toRadians(lat1);
            lat2 = toRadians(lat2);

    var a = Math.sin(deltaLat/2) * Math.sin(deltaLat/2) +
            Math.sin(deltaLon/2) * Math.sin(deltaLon/2) * Math.cos(lat1) * Math.cos(lat2);
    var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return (EARTH_RADIUS * c).toFixed(0);
};

exports.received_headers = function (connection) {
    var plugin = this;
    var txn = connection.transaction;
    var received = txn.header.get_all('received');
    if (!received.length) return;

    var results = [];

    // Try and parse each received header
    for (var i=0; i < received.length; i++) {
        var match = /\[(\d+\.\d+\.\d+\.\d+)\]/.exec(received[i]);
        if (!match) continue;
        if (net_utils.is_rfc1918(match[1])) continue;  // exclude private IP

        var gi = plugin.get_geoip(match[1]);
        connection.loginfo(plugin, 'received=' + match[1] + ' country=' + ((gi) ? gi.country : 'UNKNOWN'));
        results.push(match[1] + ':' + ((gi) ? gi.country : 'UNKNOWN'));
    }
    return results;
};

exports.originating_headers = function (connection) {
    var plugin = this;
    var txn = connection.transaction;

    // Try and parse any originating IP headers
    var orig = txn.header.get('x-originating-ip') ||
               txn.header.get('x-ip') ||
               txn.header.get('x-remote-ip');

    if (!orig) return;

    var match = /(\d+\.\d+\.\d+\.\d+)/.exec(orig);
    if (!match) return;
    var found_ip = match[1];
    if (!net.isIPv4(found_ip)) return;
    if (net_utils.is_rfc1918(found_ip)) return;

    var gi = plugin.geoip.lookup(found_ip);
    connection.loginfo(plugin, 'originating=' + found_ip + ' country=' + ((gi) ? gi.country : 'UNKNOWN'));
    return found_ip + ':' + ((gi) ? gi.country : 'UNKNOWN');
};
