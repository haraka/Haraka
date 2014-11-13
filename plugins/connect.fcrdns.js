var dns       = require('dns'),
    net       = require('net'),
    utils     = require('./utils'),
    net_utils = require('./net_utils');

exports.register = function () {
    var plugin = this;
    var load_config = function () {
        plugin.cfg = plugin.config.get('connect.fcrdns.ini', {
            booleans: [
                '-reject.no_rdns',
                '-reject.no_fcrdns',
                '-reject.invalid_tld',
                '-reject.generic_rdns',
            ]
        }, load_config);
    };
    load_config();
};

exports.hook_lookup_rdns = function (next, connection) {
    var plugin = this;
    var rip = connection.remote_ip;
    if (net_utils.is_rfc1918(rip)) {
        connection.results.add(plugin, {skip: "private_ip"});
        return next();
    }

    connection.results.add(plugin, {
        fcrdns: [],               // PTR host names that resolve to this IP
        invalid_tlds: [],         // rDNS names with invalid TLDs
        other_ips: [],            // IPs from names that didn't match
        ptr_names: [],            // Array of host names from PTR query
        ptr_multidomain: false,   // Multiple host names in different domains
        has_rdns: false,          // does IP have PTR records?
        ptr_name_has_ips: false,  // PTR host has IP address(es)
        ptr_name_to_ip: {},       // host names and their IP addresses
    });

    plugin.refresh_config(connection);

    var called_next = 0;
    var timer;
    var do_next = function (code, msg) {
        if (called_next) return;
        called_next++;
        clearTimeout(timer);
        return next(code, msg);
    };

    // Set-up timer
    timer = setTimeout(function () {
        connection.results.add(plugin, {err: 'timeout', emit: true});
        if (plugin.cfg.reject.no_rdns) {
            return do_next(DENYSOFT, 'client [' + rip + '] rDNS lookup timeout');
        }
        return do_next();
    }, (plugin.cfg.main.timeout || 30) * 1000);

    dns.reverse(rip, function (err, ptr_names) {
        connection.logdebug(plugin, 'rdns lookup: ' + rip);
        if (err) return plugin.handle_ptr_error(connection, err, do_next);

        connection.results.add(plugin, {ptr_names: ptr_names});
        connection.results.add(plugin, {has_rdns: true});

        // Fetch A records for each PTR host name
        var pending_queries = 0;
        var queries_run = false;
        var results = {};
        for (var i=0; i<ptr_names.length; i++) {
            var ptr_domain = ptr_names[i].toLowerCase();
            results[ptr_domain] = [];

            // Make sure TLD is valid
            if (!net_utils.get_organizational_domain(ptr_domain)) {
                connection.results.add(plugin, {fail: 'valid_tld(' + ptr_domain +')'});
                if (!plugin.cfg.reject.invalid_tld) continue;
                if (net_utils.is_rfc1918(rip)) continue;
                return do_next(DENY, 'client [' + rip +
                        '] rejected; invalid TLD in rDNS (' + ptr_domain + ')');
            }

            queries_run = true;
            connection.logdebug(plugin, 'domain: ' + ptr_domain);
            pending_queries++;
            (function (ptr_domain) {  /* BEGIN BLOCK SCOPE */
            dns.resolve(ptr_domain, function(err, ips_from_fwd) {
                pending_queries--;
                if (err) {
                    plugin.handle_a_error(connection, err, ptr_domain);
                }
                else {
                    connection.logdebug(plugin, ptr_domain + ' => ' + ips_from_fwd);
                    results[ptr_domain] = ips_from_fwd;
                }
                if (pending_queries > 0) return;

                // Got all DNS results
                connection.results.add(plugin, {ptr_name_to_ip: results});
                return plugin.check_fcrdns(connection, results, do_next);
            });
            })(ptr_domain); /* END BLOCK SCOPE */
        }

        // No valid PTR
        if (!queries_run || (queries_run && pending_queries === 0)) {
            return do_next();
        }
    });
};

exports.hook_data_post = function (next, connection) {
    var plugin = this;
    var txn = connection.transaction;
    txn.remove_header('X-Haraka-rDNS');
    txn.remove_header('X-Haraka-FCrDNS');
    txn.remove_header('X-Haraka-rDNS-OtherIPs');
    txn.remove_header('X-Haraka-HostID');

    var fcrdns = connection.results.get('connect.fcrdns');
    if (!fcrdns) {
        connection.results.add(plugin, {err: "no fcrdns results!?"});
        return next();
    }

    if (fcrdns.name && fcrdns.name.length) {
        txn.add_header('X-Haraka-rDNS', fcrdns.name.join(' '));
    }
    if (fcrdns.fcrdns && fcrdns.fcrdns.length) {
        txn.add_header('X-Haraka-FCrDNS', fcrdns.fcrdns.join(' '));
    }
    if (fcrdns.other_ips && fcrdns.other_ips.length) {
        txn.add_header('X-Haraka-rDNS-OtherIPs', fcrdns.other_ips.join(' '));
    }
    return next();
};

exports.handle_a_error = function(connection, err, domain) {
    var plugin = this;

    switch (err.code) {
        case 'ENOTFOUND':
        case dns.NOTFOUND:
        case dns.NXDOMAIN:
            connection.results.add(plugin, {fail: 'ptr_valid('+domain+')' });
            break;
        default:
            connection.results.add(plugin, {err: err});
    }
};

exports.handle_ptr_error = function(connection, err, do_next) {
    var plugin = this;
    var rip = connection.remote_ip;

    switch (err.code) {
        case 'ENOTFOUND':
        case dns.NOTFOUND:
        case dns.NXDOMAIN:
            connection.results.add(plugin, {fail: 'has_rdns', emit: true});
            if (plugin.cfg.reject.no_rdns) {
                return do_next(DENY, 'client [' + rip + '] rejected; no rDNS');
            }
            return do_next();
        default:
            connection.results.add(plugin, {err: err.code});
            if (plugin.cfg.reject.no_rdns) {
                return do_next(DENYSOFT, 'client [' + rip + '] rDNS lookup error (' + err + ')');
            }
            return do_next();
    }
};

exports.check_fcrdns = function(connection, results, do_next) {
    var plugin = this;

    for (var fdom in results) {    // mail.example.com
        if (!fdom) continue;
        var org_domain = net_utils.get_organizational_domain(fdom); // example.com

        // Multiple domains?
        if (last_domain && last_domain !== org_domain) {
            connection.results.add(plugin, {ptr_multidomain: true});
        }
        else {
            var last_domain = org_domain;
        }

        // FCrDNS? PTR -> (A | AAAA) 3. PTR comparison
        plugin.ptr_compare(results[fdom], connection, fdom);

        connection.results.add(plugin, {ptr_name_has_ips: true});

        if (plugin.is_generic_rdns(connection, fdom) &&
            plugin.cfg.reject.generic_rdns) {
            return do_next(DENY, 'client ' + fdom + ' [' + connection.remote_ip +
                '] rejected; generic rDNS, please use your ISPs SMTP relay');
        }
    }

    plugin.log_summary(connection);
    plugin.save_auth_results(connection);

    var r = connection.results.get('connect.fcrdns');
    if (!r.fcrdns.length && plugin.cfg.reject.no_fcrdns) {
        return do_next(DENY, 'Sorry, no FCrDNS match found');
    }
    return do_next();
};

exports.ptr_compare = function (ip_list, connection, domain) {
    var plugin = this;
    if (!ip_list) return false;
    if (!ip_list.length) return false;

    if (ip_list.indexOf(connection.remote_ip) !== -1) {
        connection.results.add(plugin, {pass: 'fcrdns' });
        connection.results.push(plugin, {fcrdns: domain});
        return true;
    }
    if (net_utils.same_ipv4_network(connection.remote_ip, ip_list)) {
        connection.results.add(plugin, {pass: 'fcrdns(net)' });
        connection.results.push(plugin, {fcrdns: domain});
        return true;
    }
    for (var j=0; j<ip_list.length; j++) {
        connection.results.push(plugin, {other_ips: ip_list[j]});
    }
    return false;
};

exports.save_auth_results = function (connection) {
    var r = connection.results.get('connect.fcrdns');
    if (!r) return;
    if (r.fcrdns && r.fcrdns.length) {
        connection.auth_results('iprev=pass');
        return true;
    }
    if (!r.has_rdns) {
        connection.auth_results('iprev=permerror');
        return false;
    }
    if (r.err.length) {
        connection.auth_results('iprev=temperror');
        return false;
    }
    connection.auth_results('iprev=fail');
    return false;
};

exports.is_generic_rdns = function (connection, domain) {
    var plugin = this;
    // IP in rDNS? (Generic rDNS)
    if (!domain) return false;

    if (!net_utils.is_ip_in_str(connection.remote_ip, domain)) {
        connection.results.add(plugin, {pass: 'is_generic_rdns'});
        return false;
    }

    connection.results.add(plugin, {fail: 'is_generic_rdns'});

    var orgDom = net_utils.get_organizational_domain(domain);
    if (!orgDom) {
        connection.loginfo(this, 'no org domain for: ' + domain);
        return false;
    }

    var host_part = domain.split('.').slice(0,orgDom.split('.').length+1);
    if (/(?:static|business)/.test(host_part)) {
        // Allow some obvious generic but static ranges
        // EHLO/HELO checks will still catch out hosts that use generic rDNS there
        connection.loginfo(this, 'allowing generic static rDNS');
        return false;
    }

    return true;
};

exports.log_summary = function (connection) {
    if (!connection) return;   // connection went away
    var note = connection.results.get('connect.fcrdns');
    if (!note) return;

    connection.loginfo(this,
        ['ip=' + connection.remote_ip,
        'rdns="' + ((note.ptr_names.length > 2) ? note.ptr_names.slice(0,2).join(',') + '...' : note.ptr_names.join(',')) + '"',
        'rdns_len=' + note.ptr_names.length,
        'fcrdns="' + ((note.fcrdns.length > 2) ? note.fcrdns.slice(0,2).join(',') + '...' : note.fcrdns.join(',')) + '"',
        'fcrdns_len=' + note.fcrdns.length,
        'other_ips_len=' + note.other_ips.length,
        'invalid_tlds=' + note.invalid_tlds.length,
        'generic_rdns=' + ((note.ptr_name_has_ips) ? 'true' : 'false'),
        ].join(' '));
};

exports.refresh_config = function (connection) {
    var plugin = this;
    // allow rdns_acccess whitelist to override
    if (connection.notes.rdns_access && connection.notes.rdns_access === 'white') {
        plugin.cfg.reject.no_rdns = 0;
        plugin.cfg.reject.invalid_tld = 0;
        plugin.cfg.reject.generic_rdns = 0;
    }

    return plugin.cfg;
};
