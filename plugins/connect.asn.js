// determine the ASN of the connecting IP

var dns = require('dns');
var providers = [];

exports.register = function () {
    var config = this.config.get('connect.asn.ini');
    if (config.main.providers) {
        providers = config.main.providers.split(/[\s,;]+/);
    }
    else {
        providers.push('origin.asn.cymru.com');
        // broken due to TXT handling bug in node.js
        // providers.push('asn.routeviews.org');
        // TODO: test after 3/1/2014 and see if bug is fixed
    }
};

exports.hook_lookup_rdns = function (next, connection) {
    var plugin = this;
    var ip = connection.remote_ip;
    var pending = 0;

    for (var i=0; i < providers.length; i++) {
        var zone = providers[i];
        // connection.logdebug(plugin, "zone: " + zone);

        var query = ip.split('.').reverse().join('.') + '.' + zone;
        // connection.logdebug(plugin, "query: " + query);

        pending++;
        dns.resolveTxt(query, function (err, addrs) {
            pending--;
            if (err) {
                connection.logerror(plugin, "error: " + err + ' running: ' + query);
            }
            else {
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
            }
            if (pending === 0) return next();
        });
    }
    if (pending === 0) return next();
};

exports.parse_routeviews = function (str, connection) {
    var plugin = this;
    var r = str.split(/ /);
    if (r.length !== 3) {
        connection.logerror(plugin, "result length not 3: " + r.length + ' string="' + str + '"');
        return null;
    }
    connection.loginfo(plugin, 'routeviews: asn=' + r[0] + ' net=' + r[1]);
    if (!connection.notes.asn) connection.notes.asn = {};
    connection.notes.asn['routeviews'] = { asn: r[0], net: r[1] };
    return r[0];
};

exports.parse_cymru = function (str, connection) {
    var plugin = this;
    var r = str.split(/\s+\|\s+/);
    // 99.177.75.208.origin.asn.cymru.com. 14350 IN TXT "40431 | 208.75.176.0/21 | US | arin | 2007-03-02"
    // handle this: cymru: result length not 5: 4 string="10290 | 12.129.48.0/24 | US | arin |"
    if (r.length < 4) {
        connection.logerror(plugin, "cymru: bad result length " + r.length + ' string="' + str + '"');
        return null;
    }
    connection.loginfo(plugin, 'cymru: asn=' + r[0] + ' net=' + r[1] + ' country=' + r[2] +
                               ' authority=' + r[3] + (r[4] ? ' date=' + r[4] : ''));
    if (!connection.notes.asn) connection.notes.asn = {};
    connection.notes.asn['cymru'] = { asn: r[0], net: r[1], country: r[2], authority: r[3], date: r[4] };
    return r[0];
};

exports.hook_data_post = function (next, connection) {
    var txn = connection.transaction;
    if (!connection.notes.asn) return next();
    for (var l in connection.notes.asn) {
       var name = l[0].toUpperCase() + l.slice(1);
       name = 'X-Haraka-ASN-' + name;
       var values = [];
       for (var k in connection.notes.asn[l]) {
           values.push(k + '=' + connection.notes.asn[l][k]);
       }
       txn.add_header(name, values.join(' '));
   }
   return next();
};
