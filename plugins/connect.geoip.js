var geoip = require('geoip-lite');
var net = require('net');

var local_ip, local_geoip;

exports.hook_connect = function (next, connection) {
    var plugin = this;
    connection.notes.geoip = geoip.lookup(connection.remote_ip);

    if (!connection.notes.geoip) return next();

    var cfg = this.config.get('connect.geoip.ini');
    calculate_distance(plugin, connection, cfg);

    connection.loginfo(plugin, get_results(connection, cfg));

    return next();
}

exports.hook_data_post = function (next, connection) {
    var txn = connection.transaction;
    txn.remove_header('X-Haraka-GeoIP');
    txn.remove_header('X-Haraka-GeoIP-Received');
    if (connection.notes.geoip) {
        var cfg = this.config.get('connect.geoip.ini');
        txn.add_header('X-Haraka-GeoIP', get_results(connection, cfg));
    }

    var received = [];

    var rh = received_headers(connection, this);
    if (rh) received.push(rh);
    if (!rh) user_agent(connection, this); // No received headers.

    var oh = originating_headers(connection, this);
    if (oh) received.push(oh);

    // Add any received results to a trace header
    if (received.length) {
        txn.add_header('X-Haraka-GeoIP-Received', received.join(' '));
    }
    return next();
};

function calculate_distance(plugin, connection, cfg) {
    if (!cfg.main.calc_distance) return;

    if (!local_ip) { local_ip = cfg.main.public_ip; };
    if (!local_ip) { local_ip = connection.local_ip; };
    if (!local_ip) return;

    if (!local_geoip) {
        local_geoip = geoip.lookup(local_ip)
        connection.loginfo(plugin, "local_geoip set: "+local_geoip);
    };
    if (!local_geoip) return;

//  two formulas for calculating Great Circle Distance. Perhaps worth
//  benchmarking them?

//  var gcd = geodatasource(local_geoip.ll[0], local_geoip.ll[1],
//      connection.notes.geoip.ll[0], connection.notes.geoip.ll[1]);

    var gcd = haversine(local_geoip.ll[0], local_geoip.ll[1],
        connection.notes.geoip.ll[0], connection.notes.geoip.ll[1]);

    connection.notes.geoip.distance = gcd;
};

function haversine(lat1, lon1, lat2, lon2) {
    var R = 6371; // km
    function toRad(v) { return v * Math.PI / 180; };
    var dLat = toRad(lat2-lat1);
    var dLon = toRad(lon2-lon1);
    var lat1 = toRad(lat1);
    var lat2 = toRad(lat2);

    var a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.sin(dLon/2) * Math.sin(dLon/2) * Math.cos(lat1) * Math.cos(lat2);
    var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    var d = R * c;
    return d.toFixed(0);
}

function geodatasource(lat1, lon1, lat2, lon2) {
//:::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::
//:::  From: http://www.geodatasource.com/developers/javascript
//:::                                                                         :::
//:::  This routine calculates the distance between two points (given the     :::
//:::  latitude/longitude of those points).
//:::                                                                         :::
//:::  Definitions:                                                           :::
//:::    South latitudes are negative, east longitudes are positive           :::
//:::                                                                         :::
//:::  Passed to function:                                                    :::
//:::    lat1, lon1 = Latitude and Longitude of point 1 (in decimal degrees)  :::
//:::    lat2, lon2 = Latitude and Longitude of point 2 (in decimal degrees)  :::
//:::                                                                         :::
//:::               GeoDataSource.com (C) All Rights Reserved 2014            :::
//:::                                                                         :::
//:::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::

    var radlat1 = Math.PI * lat1/180;
    var radlat2 = Math.PI * lat2/180;
    var radlon1 = Math.PI * lon1/180;
    var radlon2 = Math.PI * lon2/180;
    var theta = lon1-lon2;
    var radtheta = Math.PI * theta/180;
    var dist = Math.sin(radlat1) * Math.sin(radlat2) + Math.cos(radlat1) * Math.cos(radlat2) * Math.cos(radtheta);
    dist = Math.acos(dist);
    dist = dist * 180/Math.PI;
    dist = dist * 60 * 1.1515;
    dist = dist * 1.609344;
    return dist.toFixed(0);
}

function get_results(connection, cfg) {
    var r = connection.notes.geoip;
    if (!r) return '';

    // geoip.lookup results look like this:
    // range: [ 3479299040, 3479299071 ],
    //    country: 'US',
    //    region: 'CA',
    //    city: 'San Francisco',
    //    ll: [37.7484, -122.4156]

    var show = [ r.country ];
    if ( r.region && cfg.main.show_region) show.push(r.region);
    if ( r.city   && cfg.main.show_city  ) show.push(r.city);
    if ( r.distance && cfg.main.calc_distance ) show.push(r.distance+'km');

    return show.join(', ');
};

function user_agent(connection, plugin) {
    // Check for User-Agent
    var ua = connection.transaction.header.get('user-agent');
    var xm = connection.transaction.header.get('x-mailer');
    var xmu = connection.transaction.header.get('x-mua');
    if (ua || xm || xmu) {
        connection.loginfo(plugin, 'direct-to-mx?');
    }
};

function received_headers(connection, plugin) {
    var txn = connection.transaction;
    var received = txn.header.get_all('received');
    if (!received.length) return;

    var results = [];

    // Try and parse each received header
    for (var i=0; i < received.length; i++) {
        var match = /\[(\d+\.\d+\.\d+\.\d+)\]/.exec(received[i]);
        if (match && net.isIPv4(match[1])) {
            var gi = geoip.lookup(match[1]);
            connection.loginfo(plugin, 'received=' + match[1] + ' country=' + ((gi) ? gi.country : 'UNKNOWN'));
            results.push(match[1] + ':' + ((gi) ? gi.country : 'UNKNOWN'));
        }
    }
    return results;
};

function originating_headers(connection, plugin) {
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

    var gi = geoip.lookup(found_ip);
    connection.loginfo(plugin, 'originating=' + found_ip + ' country=' + ((gi) ? gi.country : 'UNKNOWN'));
    return found_ip + ':' + ((gi) ? gi.country : 'UNKNOWN');
}
