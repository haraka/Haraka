'use strict';

var fs        = require('fs');
var net       = require('net');

var net_utils = require('haraka-net-utils');

exports.register = function () {
    var plugin = this;

    plugin.load_geoip_ini();
    plugin.hasProvider = plugin.load_maxmind();

    if (!plugin.hasProvider) {
        plugin.hasProvider = plugin.load_geoip_lite();
    }
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
    function () {
        plugin.load_geoip_ini();
    });
};

exports.load_maxmind = function () {
    var plugin = this;

    try {
        plugin.maxmind = require('maxmind');
    }
    catch (e) {
        plugin.logerror(e);
        plugin.logerror("unable to load maxmind, try\n\n\t" +
             "'npm install -g maxmind'\n\n");
        return;
    }

    var dbs = ['GeoIPCity', 'GeoIP', 'GeoIPASNum', 'GeoISP',
               'GeoIPCityv6', 'GeoIPv6', 'GeoIPASNumv6',
               'GeoIPNetSpeedCell', 'GeoIPOrg', 'GeoLiteCityV6', 'GeoLiteCity'];
    var dbsFound = [];

    var dbdir = plugin.cfg.main.dbdir || '/usr/local/share/GeoIP/';
    for (var i=0; i < dbs.length; i++) {
        var path = dbdir + dbs[i] + '.dat';
        if (!fs.existsSync(path)) continue;
        dbsFound.push(path);
    }

    plugin.maxmind.dbsLoaded = dbsFound.length;
    if (dbsFound.length === 0) {
        plugin.logerror('maxmind loaded but no GeoIP DBs found!');
        return;
    }

    plugin.loginfo('provider maxmind with ' + dbsFound.length + ' DBs');
    plugin.maxmind.init(dbsFound, {indexCache: true, checkForUpdates: true});
    plugin.register_hook('connect',   'lookup_maxmind');
    plugin.register_hook('data_post', 'add_headers');

    return true;
};

exports.load_geoip_lite = function () {
    var plugin = this;

    try {
        plugin.geoip = require('geoip-lite');
    }
    catch (e) {
        plugin.logerror("unable to load geoip-lite, try\n\n" +
                "\t'npm install -g geoip-lite'\n\n");
        return;
    }

    if (!plugin.geoip) {
        // geoip-lite dropped node 0.8 support, it may not have loaded
        plugin.logerror('unable to load geoip-lite');
        return;
    }

    plugin.loginfo('provider geoip-lite');
    plugin.register_hook('connect',   'lookup_geoip');
    plugin.register_hook('data_post', 'add_headers');

    return true;
};

exports.get_maxmind_asn = function (connection) {
    var plugin = this;

    var asn = plugin.maxmind.getAsn(connection.remote.ip);
    if (!asn) return;

    var match = asn.match(/^(?:AS)([0-9]+)\s+(.*)$/);
    if (!match) {
        connection.logerror(plugin, 'unexpected AS format: ' + asn);
        return;
    }

    var report_as = plugin;
    if (plugin.cfg.asn && plugin.cfg.asn.report_as) {
        report_as = { name: plugin.cfg.asn.report_as };
    }
    connection.results.add(report_as,
            { emit: true, asn: match[1], org: match[2] });
};

exports.lookup_maxmind = function (next, connection) {
    var plugin = this;

    if (!plugin.maxmind) { return next(); }
    if (!plugin.maxmind.dbsLoaded) { return next(); }

    var show = [];

    plugin.get_maxmind_asn(connection);

    var loc = plugin.get_geoip_maxmind(connection.remote.ip);
    if (!loc) return next();

    if (loc.continentCode && loc.continentCode !== '--') {
        connection.results.add(plugin, {continent: loc.continentCode});
        show.push(loc.continentCode);
    }
    var cc = loc.countryCode || loc.code;
    if (cc && cc !== '--') {
        connection.results.add(plugin, {country: cc});
        show.push(cc);
    }
    if (loc.city && loc.city !== '--') {
        connection.results.add(plugin, {city: loc.city});
        if (plugin.cfg.main.show_city) show.push(loc.city);
    }
    if (loc.region && loc.region !== '--') {
        connection.results.add(plugin, {region: loc.region});
        if (plugin.cfg.main.show_region) show.push(loc.region);
    }
    if (loc.latitude) {
        connection.results.add(plugin, {ll: [loc.latitude, loc.longitude]});
        connection.results.add(plugin, {
            geo: {
                lat: loc.latitude,
                lon: loc.longitude
            }
        });
    }

    if (show.length === 0) return next();

    if (!plugin.cfg.main.calc_distance) {
        connection.results.add(plugin, {human: show.join(', '), emit:true});
        return next();
    }

    function calcDone (err, distance) {
        if (err) { connection.results.add(plugin, {err: err}); }
        if (distance) { show.push(distance+'km'); }
        connection.results.add(plugin, {human: show.join(', '), emit:true});
        return next();
    }
    plugin.calculate_distance(connection,
              [loc.latitude, loc.longitude], calcDone);
};

exports.lookup_geoip = function (next, connection) {
    var plugin = this;

    // geoip results look like this:
    // range: [ 3479299040, 3479299071 ],
    //    country: 'US',
    //    region: 'CA',
    //    city: 'San Francisco',
    //    ll: [37.7484, -122.4156]

    if (!plugin.geoip) {
        connection.logerror(plugin, 'geoip-lite not loaded');
        return next();
    }

    var r = plugin.get_geoip_lite(connection.remote.ip);
    if (!r) { return next(); }

    connection.results.add(plugin, r);

    var show = [];
    if (r.country  && r.country !== '--') show.push(r.country);
    if (r.region   && plugin.cfg.main.show_region) { show.push(r.region); }
    if (r.city     && plugin.cfg.main.show_city  ) { show.push(r.city); }

    if (show.length === 0) return next();

    if (!plugin.cfg.main.calc_distance) {
        connection.results.add(plugin, {human: show.join(', '), emit:true});
        return next();
    }

    plugin.calculate_distance(connection, r.ll, function (err, distance) {
        if (distance) show.push(distance+'km');
        connection.results.add(plugin, {human: show.join(', '), emit:true});
        return next();
    });
};

exports.get_geoip = function (ip) {
    var plugin = this;
    if (!ip) return;
    if (!net.isIPv4(ip) && !net.isIPv6(ip)) return;
    if (net_utils.is_private_ip(ip)) return;

    var res = plugin.get_geoip_maxmind(ip);
    if (!res) {
        res = plugin.get_geoip_lite(ip);
    }
    if (!res) return;

    var show = [];
    if (res.continentCode) show.push(res.continentCode);
    if (res.countryCode || res.code) show.push(res.countryCode || res.code);
    if (res.region)        show.push(res.region);
    if (res.city)          show.push(res.city);
    res.human = show.join(', ');

    return res;
};

exports.get_geoip_maxmind = function (ip) {
    var plugin = this;
    if (!plugin.maxmind) return;

    var ipv6 = net.isIPv6(ip);

    var result;
    try {
        // Try GeoIPCity first
        result = ipv6 ? plugin.maxmind.getLocationV6(ip)
                      : plugin.maxmind.getLocation(ip);
    }
    catch (e) {
        plugin.logerror(e.message);
    }
    if (!result) {
        try {
            // then try GeoIP country
            result = ipv6 ? plugin.maxmind.getCountryV6(ip)
                          : plugin.maxmind.getCountry(ip);
        }
        catch (e) {
            plugin.logerror(e.message);
        }
    }
    return result;
};

exports.get_geoip_lite = function (ip) {
    var plugin = this;
    if (!plugin.geoip) return;
    if (!net.isIPv4(ip)) return;

    var result = plugin.geoip.lookup(ip);
    if (result && result.ll) {
        result.latitude = result.ll[0];
        result.longitude = result.ll[1];
    }

    return result;
};

exports.add_headers = function (next, connection) {
    var plugin = this;
    var txn = connection.transaction;
    if (!txn) { return; }
    txn.remove_header('X-Haraka-GeoIP');
    txn.remove_header('X-Haraka-GeoIP-Received');
    var r = connection.results.get('connect.geoip');
    if (r) {
        if (r.country) txn.add_header('X-Haraka-GeoIP',   r.human  );
        if (r.asn)     txn.add_header('X-Haraka-ASN',     r.asn    );
        if (r.asn_org) txn.add_header('X-Haraka-ASN-Org', r.asn_org);
    }

    var received = [];

    var rh = plugin.received_headers(connection);
    if (rh && rh.length) received.push(rh);

    var oh = plugin.originating_headers(connection);
    if (oh) received.push(oh);

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
        connection.logerror(plugin, "can't calculate distance, " +
                'set public_ip in smtp.ini');
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
        if (gcd && isNaN(gcd)) return done();

        connection.results.add(plugin, {distance: gcd});

        if (plugin.cfg.main.too_far &&
            (parseFloat(plugin.cfg.main.too_far) < parseFloat(gcd))) {
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
            Math.sin(deltaLon/2) * Math.sin(deltaLon/2) *
            Math.cos(lat1) * Math.cos(lat2);
    var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return (EARTH_RADIUS * c).toFixed(0);
};

exports.received_headers = function (connection) {
    var plugin = this;
    var txn = connection.transaction;
    var received = txn.header.get_all('received');
    if (!received.length) return;

    var results = [];
    var ipany_re = net_utils.get_ipany_re('[\\[\\(](?:IPv6:)?', '[\\]\\)]');

    // Try and parse each received header
    for (var i=0; i < received.length; i++) {
        var match = ipany_re.exec(received[i]);
        if (!match) continue;
        if (net_utils.is_private_ip(match[1])) continue;  // exclude private IP

        var gi = plugin.get_geoip(match[1]);
        var country = gi ? (gi.countryCode || gi.code) : '';
        var logmsg = 'received=' + match[1];
        if (country) {
            logmsg += ' country=' + country;
            results.push(match[1] + ':' + country);
        }
        connection.loginfo(plugin, logmsg);
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

    var match = net_utils.get_ipany_re('(?:IPv6:)?').exec(orig);
    if (!match) return;

    var found_ip = match[1];
    if (net_utils.is_private_ip(found_ip)) return;

    var gi = plugin.get_geoip(found_ip);
    if (!gi) return;

    connection.loginfo(plugin, 'originating=' + found_ip + ' ' + gi.human);
    return found_ip + ':' + (gi.countryCode || gi.code);
};
