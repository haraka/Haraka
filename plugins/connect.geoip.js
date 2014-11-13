var net       = require('net'),
    net_utils = require('./net_utils');

exports.register = function () {
    var plugin = this;
    try {
        plugin.geoip = require('geoip-lite');
    }
    catch (e) {
        plugin.logerror("unable to load geoip-lite, try\n\n\t'npm install -g geoip-lite'\n\n");
        return;
    }

    if (!plugin.geoip) {
        // geoip-lite dropped node 0.8 support
        plugin.logerror("unable to load geoip-lite");
        return;
    }

    plugin.register_hook('connect',     'geoip_lookup');
    plugin.register_hook('data_post',   'geoip_headers');
};

exports.geoip_lookup = function (next, connection) {
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

    var r = plugin.geoip.lookup(connection.remote_ip);
    if (!r) { return next(); }

    connection.results.add(plugin, r);

    plugin.cfg = plugin.config.get('connect.geoip.ini', {
        booleans: [
            '+main.show_city',
            '+main.show_region',
            '-main.calc_distance',
        ],
    });
    if (plugin.cfg.main.calc_distance) {
        r.distance = plugin.calculate_distance(connection, r);
    }

    var show = [ r.country ];
    if (r.region   && plugin.cfg.main.show_region) { show.push(r.region); }
    if (r.city     && plugin.cfg.main.show_city  ) { show.push(r.city); }
    if (r.distance                               ) { show.push(r.distance+'km');}

    connection.results.add(plugin, {human: show.join(', '), emit:true});
    return next();
};

exports.geoip_headers = function (next, connection) {
    var plugin = this;
    var txn = connection.transaction;
    if (!txn) { return; }
    txn.remove_header('X-Haraka-GeoIP');
    txn.remove_header('X-Haraka-GeoIP-Received');
    var geoip = connection.results.get('connect.geoip');
    if (geoip) {
        txn.add_header('X-Haraka-GeoIP', geoip.human);
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

exports.calculate_distance = function (connection, r_geoip) {
    var plugin = this;

    var cb = function (err, l_ip) {
        if (err) {
            connection.results.add(plugin, {err: err});
            connection.logerror(plugin, err);
        }
        if (!plugin.local_ip) { plugin.local_ip = l_ip; }
        if (!plugin.local_ip) { plugin.local_ip = plugin.cfg.main.public_ip; }
        if (!plugin.local_ip) {
            connection.logerror(plugin, "can't calculate distance, set public_ip in smtp.ini");
            return;
        }

        if (!plugin.local_geoip) { plugin.local_geoip = plugin.geoip.lookup(plugin.local_ip); }
        if (!plugin.local_geoip) {
            connection.logerror(plugin, "no GeoIP results for local_ip!");
            return;
        }

        var gcd = plugin.haversine(plugin.local_geoip.ll[0], plugin.local_geoip.ll[1],
                                    r_geoip.ll[0], r_geoip.ll[1]);

        connection.results.add(plugin, {distance: gcd});

        if (plugin.cfg.main.too_far && (parseFloat(plugin.cfg.main.too_far) < parseFloat(gcd))) {
            connection.results.add(plugin, {too_far: true});
        }
        return gcd;
    };

    if (plugin.local_ip) return cb(undefined, plugin.local_ip);
    net_utils.get_public_ip(cb);
};

exports.haversine = function (lat1, lon1, lat2, lon2) {
    // calculate the great circle distance using the haversine formula
    // found here: http://www.movable-type.co.uk/scripts/latlong.html
    var R = 6371; // km
    function toRad(v) { return v * Math.PI / 180; }
    var dLat = toRad(lat2-lat1);
    var dLon = toRad(lon2-lon1);
        lat1 = toRad(lat1);
        lat2 = toRad(lat2);

    var a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.sin(dLon/2) * Math.sin(dLon/2) * Math.cos(lat1) * Math.cos(lat2);
    var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    var d = R * c;
    return d.toFixed(0);
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
        if (!net.isIPv4(match[1])) continue;  // TODO: support IPv6
        if (net_utils.is_rfc1918(match[1])) continue;  // exclude private IP

        var gi = plugin.geoip.lookup(match[1]);
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
