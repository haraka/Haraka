var dns = require('dns');
var net = require('net');
var utils = require('./utils');
var net_utils = require('./net_utils');

var reject_no_rdns = 0;
var reject_no_fcrdns = 0;
var reject_invalid_tld = 0;
var reject_generic_rdns = 0;

exports.hook_lookup_rdns = function (next, connection) {
    var plugin = this;
    if (net_utils.is_rfc1918(connection.remote_ip)) {
        connection.results.add(plugin, {skip: "private_ip"});
        return next();
    }

    connection.results.add(plugin, {
        fcrdns: [],               // PTR host names that resolve to this IP
        invalid_tlds: [],         // rDNS names with invalid TLDs
        other_ips: [],            // IPs from names that didn't match
        ptr_names: [],            // Array of host names from PTR query
    });

/*  connection.notes.fcrdns = {
        ptr_name_to_ip: {},      // host names and their IP addresses
        has_rdns: false,         // does IP have PTR records?
        ptr_name_has_ips: false, // PTR host has IP address(es)
        ptr_multidomain: false,  // Multiple host names in different domains
        err: [],                 // errors encountered (including timeouts)
    }; */

    var cfg = this.config.get('connect.fcrdns.ini');
    _refresh_config(cfg, connection);

    var called_next = 0;
    var timer;
    var do_next = function (code, msg) {
        if (called_next) return;
        called_next++;
        clearTimeout(timer);
        return next(code, msg);
    };

    // Set-up timer
    var timeout = cfg.main.disconnect_timeout || 30;
    timer = setTimeout(function () {
        connection.results.add(plugin, {err: 'timeout', emit: true});
        if (reject_no_rdns) {
            return do_next(DENYSOFT, 'client [' + connection.remote_ip + '] rDNS lookup timeout');
        }
        return do_next();
    }, timeout * 1000);

    dns.reverse(connection.remote_ip, function (err, ptr_names) {
        connection.logdebug(plugin, 'rdns lookup: ' + connection.remote_ip);
        if (err) {
            connection.results.add(plugin, {fail: 'rDNS lookup('+err+')'});
            return plugin.handle_ptr_error(connection, err, do_next);
        }

        connection.results.add(plugin, {ptr_names: ptr_names});

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
                if (reject_invalid_tld && !net_utils.is_rfc1918(connection.remote_ip)) {
                    return do_next(DENY, 'client [' + connection.remote_ip +
                        '] rejected; invalid TLD in rDNS (' + ptr_domain + ')');
                }
                continue;
            }

            queries_run = true;
            connection.logdebug(plugin, 'domain: ' + ptr_domain);
            pending_queries++;
            (function (ptr_domain) {  /* BEGIN BLOCK SCOPE */
            dns.resolve(ptr_domain, function(err, ips_from_fwd) {
                pending_queries--;
                if (err) {
                    connection.results.add(plugin, {err: ptr_domain + '(' + err + ')'});
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

    if (fcrdns.err.length) {
        // TODO: this is probably not the right test to use
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

exports.handle_ptr_error = function(connection, err, do_next) {
    var plugin = this;
    switch (err.code) {
        case 'ENOTFOUND':
        case dns.NOTFOUND:
        case dns.NXDOMAIN:
            connection.results.add(plugin, {fail: 'has_rdns', msg: err.code, emit: true});
            if (reject_no_rdns) {
                return do_next(DENY, 'client [' + connection.remote_ip + '] rejected; no rDNS entry found');
            }
            return do_next();
        default:
            connection.results.add(plugin, {err: err});
            if (reject_no_rdns) {
                return do_next(DENYSOFT, 'client [' + connection.remote_ip + '] rDNS lookup error (' + err + ')');
            }
            return do_next();
    }
};

exports.check_fcrdns = function(connection, results, do_next) {
    var plugin = this;

    var found_doms = Object.keys(results);

    for (var i=0; i<found_doms.length; i++) {
        var fdom = found_doms[i];       // mail.example.com
        var org_domain = net_utils.get_organizational_domain(fdom); // example.com

        // Multiple domains?
        if (last_domain && last_domain !== org_domain) {
            connection.results.add(plugin, {ptr_multidomain: true});
        }
        else {
            var last_domain = org_domain;
        }

        // FCrDNS? PTR -> (A | AAAA) 3. PTR comparison
        var ip_list = results[fdom];
        if (ip_list.length) {
            if (ip_list.indexOf(connection.remote_ip) !== -1) {
                connection.results.add(plugin, {pass: 'fcrdns' });
                connection.results.push(plugin, {fcrdns: fdom});
            }
            else if ( net_utils.same_ipv4_network(connection.remote_ip, ip_list) ) {
                connection.results.add(plugin, {pass: 'fcrdns(same net)' });
                connection.results.push(plugin, {fcrdns: fdom});
            }
            else {
                for (var j=0; j<ip_list.length; j++) {
                    connection.results.push(plugin, {other_ips: ip_list[j]});
                }
            }
        }

        connection.results.add(plugin, {ptr_name_has_ips: true});

        var reject = plugin.is_generic_rdns(connection, fdom);
        if (reject) return do_next(DENY, reject);
    }

    plugin.log_summary(connection);
    plugin.save_auth_results(connection);

    var r = connection.results.get('connect.fcrdns');
    if (!r.fcrdns.length && reject_no_fcrdns) {
        return do_next(DENY, 'Sorry, no FCrDNS match found');
    }
    return do_next();
};

exports.save_auth_results = function (connection) {
    var r = connection.results.get('connect.fcrdns');
    if (r.fcrdns.length) {
        connection.auth_results('iprev=pass');
        return;
    }
    if (!r.has_rdns) {
        connection.auth_results('iprev=permerror');
        return;
    }
    if (r.err.length) {
        connection.auth_results('iprev=temperror');
        return;
    }
    connection.auth_results('iprev=fail');
};

exports.is_generic_rdns = function (connection, domain) {
    var plugin = this;
    // IP in rDNS? (Generic rDNS)
    if (!net_utils.is_ip_in_str(connection.remote_ip, domain)) {
        connection.results.add(plugin, {pass: 'is_generic_rdns'});
        return false;
    }

    connection.results.add(plugin, {fail: 'is_generic_rdns'});
    if (!reject_generic_rdns) return false;

    var orgDom = net_utils.get_organizational_domain(domain);
    var host_part = domain.slice(0,orgDom.split('.').length);
    if (/(?:static|business)/.test(host_part)) {
        // Allow some obvious generic but static ranges
        // EHLO/HELO checks will still catch out hosts that use generic rDNS there
        connection.loginfo(this, 'allowing generic static rDNS');
        return false;
    }

    return 'client ' + domain + ' [' + connection.remote_ip +
        '] rejected; generic rDNS, please use your ISPs SMTP relay';
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

function _refresh_config (cfg, connection) {
    if (!cfg) return;
    if (!cfg.main) return;
    if (cfg.main.reject_no_rdns !== undefined) reject_no_rdns = cfg.main.reject_no_rdns;
    if (cfg.main.reject_no_fcrdns !== undefined) reject_no_fcrdns = cfg.main.reject_no_fcrdns;
    if (cfg.main.reject_invalid_tld !== undefined) reject_invalid_tld = cfg.main.reject_invalid_tld;
    if (cfg.main.reject_generic_rdns !== undefined) reject_generic_rdns = cfg.main.reject_generic_rdns;

    // allow rdns_acccess whitelist to override
    if (connection.notes.rdns_access && connection.notes.rdns_access === 'white') {
        reject_no_rdns = 0;
        reject_invalid_tld = 0;
        reject_generic_rdns = 0;
    }
}

