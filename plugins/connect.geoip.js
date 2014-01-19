var geoip = require('geoip-lite');
var net = require('net');

exports.hook_connect = function (next, connection) {
    connection.notes.geoip = geoip.lookup(connection.remote_ip);
    if (connection.notes.geoip) {
        connection.loginfo(this, 'country: ' + connection.notes.geoip.country);
    }
    return next();
}

exports.hook_data_post = function (next, connection) {
    var txn = connection.transaction;
    txn.remove_header('X-Haraka-GeoIP');
    txn.remove_header('X-Haraka-GeoIP-Received');
    if (connection.notes.geoip) {
        txn.add_header('X-Haraka-GeoIP', connection.notes.geoip.country);
    }

    var results = [];
    var received = txn.header.get_all('received');
    if (received.length) {
        // Try and parse each received header
        for (var i=0; i < received.length; i++) {
            var match = /\[(\d+\.\d+\.\d+\.\d+)\]/.exec(received[i]);
            if (match && net.isIPv4(match[1])) {
                var gi = geoip.lookup(match[1]);
                connection.loginfo(this, 'received=' + match[1] + ' country=' + ((gi) ? gi.country : 'UNKNOWN'));
                results.push(match[1] + ':' + ((gi) ? gi.country : 'UNKNOWN'));
            }
        }
    }
    else {
        // No received headers.
        // Check for User-Agent
        var ua = txn.header.get('user-agent');
        var xm = txn.header.get('x-mailer');
        var xmu = txn.header.get('x-mua');
        if (ua || xm || xmu) {
            connection.loginfo(this, 'direct-to-mx?');
        }
    }
    // Try and parse any originating IP headers
    var orig = txn.header.get('x-originating-ip') || 
               txn.header.get('x-ip') ||
               txn.header.get('x-remote-ip');
    if (orig) {
        var match = /(\d+\.\d+\.\d+\.\d+)/.exec(orig);
        if (match && net.isIPv4(match[1])) {
            var gi = geoip.lookup(match[1]);
            connection.loginfo(this, 'originating=' + match[1] + ' country=' + ((gi) ? gi.country : 'UNKNOWN'));
            results.push(match[1] + ':' + ((gi) ? gi.country : 'UNKNOWN'));
        }
    }
    // Add any results to a trace header
    if (results.length) {
        txn.add_header('X-Haraka-GeoIP-Received', results.join(' '));
    }
    return next();
}
