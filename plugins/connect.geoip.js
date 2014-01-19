var geoip = require('geoip-lite');
var net = require('net');

exports.hook_connect = function (next, connection) {
    connection.notes.geoip = geoip.lookup(connection.remote_ip);

    if (!connection.notes.geoip) return next();

    var cfg = this.config.get('connect.geoip.ini');
    connection.loginfo(this, get_results(connection, cfg));

    return next();
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

    return show.join(', ');
};

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
