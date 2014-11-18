// determine the ASN of the connecting IP

var dns   = require('dns');
var async = require('async');
var net_utils = require('./net_utils');

var test_ip = '66.128.51.163';
var providers = [];
var conf_providers = [ 'origin.asn.cymru.com', 'asn.routeviews.org' ];

exports.register = function () {
    var plugin = this;

    plugin.load_asn_ini();

    // add working providers to the provider list
    var result_cb = function (err, zone, res) {
        if (err) {
            plugin.logerror(plugin, err);
            return;
        }
        if (!res) {
            plugin.logerror(plugin, zone + " failed");
            return;
        }

        plugin.loginfo(plugin, zone + " succeeded");
        if (providers.indexOf(zone) === -1) providers.push(zone);
    };

    // test each provider
    for (var i=0; i < conf_providers.length; i++) {
        plugin.get_dns_results(conf_providers[i], test_ip, result_cb);
    }
};

exports.load_asn_ini = function () {
    var plugin = this;
    plugin.cfg = plugin.config.get('connect.asn.ini', plugin.load_asn_ini);

    if (plugin.cfg.main.providers) {
        conf_providers = plugin.cfg.main.providers.split(/[\s,;]+/);
    }
    if (plugin.cfg.main.test_ip) {
        test_ip = plugin.cfg.main.test_ip;
    }
};

exports.get_dns_results = function (zone, ip, done) {
    var plugin = this;
    var query = ip.split('.').reverse().join('.') + '.' + zone;
    // plugin.logdebug(plugin, "query: " + query);

    var timer = setTimeout(function () {
        return done(new Error('timeout'), zone, null);
    }, (plugin.cfg.main.timeout || 4) * 1000);

    dns.resolveTxt(query, function (err, addrs) {
        clearTimeout(timer);
        if (err) {
            plugin.logerror(plugin, "error: " + err + ' running: '+query);
            return done(err, zone);
        }

        if (!addrs || !addrs[0]) {
            return done(new Error('no results for ' + query), zone);
        }

        var first = addrs[0];
        if (Array.isArray(first)) {
            // node 0.11 returns TXT records as an array of labels
            first = addrs[0].join('');  // concatenate the labels
        }

        plugin.logdebug(plugin, zone + " answers: " + addrs);
        var result;

        if (zone === 'origin.asn.cymru.com') {
            result = plugin.parse_cymru(first);
        }
        else if (zone === 'asn.routeviews.org') {
            result = plugin.parse_routeviews(addrs);
        }
        else if (zone === 'origin.asn.spameatingmonkey.net') {
            result = plugin.parse_monkey(first);
        }
        else {
            plugin.logerror(plugin, "unrecognized ASN provider: " + zone);
        }

        return done(null, zone, result);
    });
};

exports.hook_lookup_rdns = function (next, connection) {
    var plugin = this;
    var ip = connection.remote_ip;
    if (net_utils.is_rfc1918(ip)) return next();

    function provIter (zone, cb) {

        function result_cb (err, zone, r) {
            if (err) {
                connection.logerror(plugin, err.message);
                return cb();
            }
            if (!r) return cb();

            // store asn & net from any source
            if (r.asn) connection.results.add(plugin, {asn: r.asn});
            if (r.net) connection.results.add(plugin, {net: r.net});

            // store provider specific results
            if (zone === 'origin.asn.cymru.com') {
                connection.results.add(plugin, { emit: true, cymru: r});
            }
            else if (zone === 'asn.routeviews.org') {
                connection.results.add(plugin, { emit: true, routeviews: r });
            }
            else if (zone === 'origin.asn.spameatingmonkey.net') {
                connection.results.add(plugin, { emit: true, monkey: r });
            }
            return cb();
        }

        connection.logdebug(plugin, "zone: " + zone);
        plugin.get_dns_results(zone, ip, result_cb);
    }

    function provDone (err) {
        if (err) connection.logerror(plugin, err);
        next();
    }
    async.each(providers, provIter, provDone);
};

exports.parse_routeviews = function (thing) {
    var plugin = this;
    var labels;

    // this is a correct result (node >= 0.10.26)
    // 99.177.75.208.asn.routeviews.org. IN TXT "40431" "208.75.176.0" "21"
    if (Array.isArray(thing)) {
        labels = thing;
    }
    else {
        // this is what node (< 0.10.26) returns
        // 99.177.75.208.asn.routeviews.org. IN TXT "40431208.75.176.021"
        labels = thing.split(/ /);
    }

    if (labels.length !== 3) {
        plugin.logerror(plugin, "result length not 3: " + labels.length +
                ' string="' + thing + '"');
        return;
    }

    return { asn: labels[0], net: labels[1] + '/' + labels[2] };
};

exports.parse_cymru = function (str) {
    var plugin = this;
    var r = str.split(/\s+\|\s*/);
    //  99.177.75.208.origin.asn.cymru.com. 14350 IN TXT
    //        "40431 | 208.75.176.0/21 | US | arin | 2007-03-02"
    //        "10290 | 12.129.48.0/24  | US | arin |"
    if (r.length < 4) {
        plugin.logerror(plugin, "cymru: bad result length " + r.length +
                ' string="' + str + '"');
        return;
    }
    return { asn: r[0], net: r[1], country: r[2], assignor: r[3], date: r[4] };
};

exports.parse_monkey = function (str) {
    var plugin = this;
    var r = str.split(/\s+\|\s+/);
    // "74.125.44.0/23 | AS15169 | Google Inc. | 2000-03-30"
    // "74.125.0.0/16 | AS15169 | Google Inc. | 2000-03-30 | US"
    if (r.length < 3) {
        plugin.logerror(plugin, "monkey: bad result length " + r.length +
                ' string="' + str + '"');
        return;
    }
    return {
        asn: r[1].substring(2),
        net: r[0],
        org: r[2],
        date: r[3],
        country: r[4]
    };
};

exports.hook_data_post = function (next, connection) {
    var plugin = this;
    var asn = connection.results.get('connect.asn');
    if (!asn) return next();
    var txn = connection.transaction;
    plugin.cfg = plugin.config.get('connect.asn.ini');

    if (asn.asn && plugin.cfg.main.asn_header) {
        if (asn.net) {
            txn.add_header('X-Haraka-ASN', asn.asn + ' ' + asn.net);
        }
        else {
            txn.add_header('X-Haraka-ASN', asn.asn);
        }
    }

    if (plugin.cfg.main.provider_header) {
        for (var p in asn) {
            if (!asn[p].asn) {   // ignore non-object results
                // connection.logdebug(plugin, p + ", " + asn[p]);
                continue;
            }
            var name = 'X-Haraka-ASN-' + p.toUpperCase();
            var values = [];
            for (var k in asn[p]) {
                values.push(k + '=' + asn[p][k]);
            }
            txn.add_header(name, values.join(' '));
        }
    }
    return next();
};
