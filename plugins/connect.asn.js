// determine the ASN of the connecting IP

var dns = require('dns');
// var net = require('net');
// var ipaddr = require('ipaddr.js');

exports.register = function () {
    this.register_hook('lookup_rdns',  'on_connection');
};

exports.on_connection = function (next, connection) {
    var plugin = this;
    var ip = connection.remote_ip;

    var zones = ['origin.asn.cymru.com', 'asn.routeviews.org'].forEach(function(zone) {
        connection.logdebug(plugin, "zone: " + zone);

        var query = ip.split('.').reverse().join('.') + '.' + zone;
        connection.logdebug(plugin, "query: " + query);

        dns.resolve(query, 'TXT', function (err, addrs) {
            if (err) {
                connection.logerror(plugin, "error: " + err);
                return;
            };

            for (var i=0; i < addrs.length; i++) {
                connection.loginfo(plugin, zone + " answer: " + addrs[i]);
                if (zone === 'origin.asn.cymru.com') {
                    var asn = parse_cymru(addrs[i]);
                }
                else if (zone === 'asn.routeviews.org') {
                    var asn = parse_routeviews(addrs[i]);
                };
                connection.loginfo(plugin, zone + " asn: " + asn);
            };
        });
    });

    return next();
}

function parse_routeviews(str) {
    var r = str.split(/"\s+"/);
    return r[0];
};

function parse_cymru(str) {
    var r = str.split(/\s+\|\s+/);
    return r[0];

};
