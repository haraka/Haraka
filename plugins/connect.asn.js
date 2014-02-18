// determine the ASN of the connecting IP

var dns = require('dns');
var providers = [];

exports.register = function () {
    var config = this.config.get('connect.asn.ini');
    if (config.main.providers) {
        providers = config.main.providers.split(/[\s,;]+/);
    }
    else {
        providers = [ 'origin.asn.cymru.com' ];
        // broken due to TXT handling bug in node.js
        // providers.push('asn.routeviews.org');
        // TODO: test after 3/1/2014 and see if bug is fixed
    }
};

exports.hook_lookup_rdns = function (next, connection) {
    var plugin = this;
    var ip = connection.remote_ip;

    for (var i=0; i < providers.length; i++) {
        var zone = providers[i];
        // connection.logdebug(plugin, "zone: " + zone);

        var query = ip.split('.').reverse().join('.') + '.' + zone;
        // connection.logdebug(plugin, "query: " + query);

        dns.resolveTxt(query, function (err, addrs) {
            if (err) {
                connection.logerror(plugin, "error: " + err + ' running: '+query);
                return;
            }

            for (var i=0; i < addrs.length; i++) {
                connection.logdebug(plugin, zone + " answer: " + addrs[i]);
                if (zone === 'origin.asn.cymru.com') {
                    plugin.parse_cymru(addrs[i], connection);
                }
                else if (zone === 'asn.routeviews.org') {
                    plugin.parse_routeviews(addrs[i], connection);
                }
                else {
                    connection.logerror(plugin, "unrecognized ASN provider: " + zone);
                }
            }
        });
    }

    return next();
};

exports.parse_routeviews = function (str, connection) {
    var plugin = this;
    var r = str.split(/ /);
    if ( r.length !== 3 ) {
        connection.logerror("result length not 3: " + r.length + ",string length: " + str.length);
        return '';
    }
    connection.results.add(plugin, {asn: {asn: r[0], net: r[1] }, emit: true});
    return r[0];
};

exports.parse_cymru = function (str, connection) {
    var plugin = this;
    var r = str.split(/\s+\|\s+/);
    //  99.177.75.208.origin.asn.cymru.com. 14350 IN TXT "40431 | 208.75.176.0/21 | US | arin | 2007-03-02"
    if ( r.length !== 5 ) {
        connection.logerror("result length not 3: " + r.length + ",string length: " + str.length);
        return '';
    }
    connection.results.add(plugin, {asn: r[0], net: r[1], country: r[2], authority: r[3], emit: true});
    return r[0];
};
