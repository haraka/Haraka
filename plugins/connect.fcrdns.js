var dns = require('dns');
var net = require('net');
var utils = require('./utils');
var net_utils = require('./net_utils.js');

var reject_no_rdns = 0;
var reject_no_fcrdns = 0;
var reject_invalid_tld = 0;
var reject_generic_rdns = 0;

exports.register = function() {
    this.inherits('note');
};

function apply_config (cfg, connection) {
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

exports.hook_lookup_rdns = function (next, connection) {
    this.note_init({conn: connection, plugin: this});
    connection.notes.fcrdns.fcrdns = []; // rDNS names that verify to this IP
    connection.notes.fcrdns.invalid_tlds = []; // rDNS names with invalid TLDs
    connection.notes.fcrdns.other_ips = []; // IPs from names that didn't match

/*
    connection.notes.fcrdns = {
        ptr_names: [],           // Array of host names from PTR query
        ptr_name_to_ip: {},      // host names and their IP addresses
        has_rdns: false,         // does IP have PTR records?
        ptr_name_has_ips: false, // PTR host has IP address(es)
        ptr_multidomain: false,  // Multiple host names in different domains
        err: [],                 // errors encountered (including timeouts)
    };
*/
    var cfg = this.config.get('connect.fcrdns.ini');
    apply_config(cfg, connection);

    var plugin = this;
    var called_next = 0;
    var timer;
    var do_next = function (code, msg) {
        if (called_next) return;
        called_next++;
        clearTimeout(timer);
        return next(code, msg);
    };

    // Set-up timer
    var timeout = config.main.disconnect_timeout || 30;
    timer = setTimeout(function () {
        plugin.note({conn: connection, err: 'timeout', emit: true});
        if (reject_no_rdns) {
            return do_next(DENYSOFT, 'client [' + connection.remote_ip + '] rDNS lookup timeout');
        }
        return do_next();
    }, timeout * 1000);

    dns.reverse(connection.remote_ip, function (err, ptr_names) {
        connection.logdebug(plugin, 'lookup: ' + connection.remote_ip);
        if (err) return plugin.handle_ptr_error(err, do_next);

        plugin.note({conn: connection, ptr_names: ptr_names});

        // Fetch A records for each PTR host name
        var pending_queries = 0;
        var queries_run = false;
        var results = {};
        for (var i=0; i<ptr_names.length; i++) {
            var ptr_domain = ptr_names[i].toLowerCase();
            results[ptr_domain] = [];

            // Make sure TLD is valid
            if (!net_utils.getOrganizationalDomain(ptr_domain)) {
                plugin.note({conn: connection, fail: 'valid_tld(' + ptr_domain +')'});
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
                    plugin.note({conn: connection, err: ptr_domain + '(' + err + ')'});
                }
                else {
                    connection.logdebug(plugin, ptr_domain + ' => ' + ips_from_fwd);
                    results[ptr_domain] = ips_from_fwd;
                }
                if (pending_queries > 0) return;

                // Got all DNS results
                plugin.note({conn: connection, ptr_name_to_ip: results});
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
    var txn = connection.transaction;
    txn.remove_header('X-Haraka-rDNS');
    txn.remove_header('X-Haraka-FCrDNS');
    txn.remove_header('X-Haraka-rDNS-OtherIPs');
    txn.remove_header('X-Haraka-HostID');

    if (!connection.notes.fcrdns) {
        connection.logerror(this, "no fcrnds connection note!?");
        return next();
    }

    var note = connection.notes.fcrdns;
    if (note.err.length) {
        // TODO: this is probably not the right test to use
        return next();
    }

    if (note.name && note.name.length) {
        txn.add_header('X-Haraka-rDNS', note.name.join(' '));
    }
    if (note.fcrdns && note.fcrdns.length) {
        txn.add_header('X-Haraka-FCrDNS', note.fcrdns.join(' '));
    }
    if (note.other_ips && note.other_ips.length) {
        txn.add_header('X-Haraka-rDNS-OtherIPs', note.other_ips.join(' '));
    }
    return next();
};

exports.handle_ptr_error = function(err, do_next) {
    switch (err.code) {
        case 'ENOTFOUND':
        case dns.NOTFOUND:
        case dns.NXDOMAIN:
            plugin.note({conn: connection, fail: 'has_rdns', msg: err.code, emit: true});
            if (reject_no_rdns) {
                return do_next(DENY, 'client [' + connection.remote_ip + '] rejected; no rDNS entry found');
            }
            return do_next();
        default:
            plugin.note({conn: connection, err: err, emit: true});
            if (reject_no_rdns) {
                return do_next(DENYSOFT, 'client [' + connection.remote_ip + '] rDNS lookup error (' + err + ')');
            }
            return do_next();
    }
};

exports.check_fcrdns = function(connection, results, do_next) {
    var plugin = this;

    var found_doms = Object.keys(results);
    var other_ips = {};

    for (var i=0; i<found_doms.length; i++) {
        var fdom = found_doms[i];       // mail.example.com
        var org_domain = net_utils.getOrganizationalDomain(fdom); // example.com

        // Multiple domains?
        if (last_domain && last_domain !== org_domain) {
            plugin.note({conn: connection, ptr_multidomain: true});
        }
        else {
            var last_domain = org_domain;
        }

        // FCrDNS? PTR -> (A | AAAA) 3. PTR comparison
        if (results[fdom].indexOf(connection.remote_ip) !== -1) {
            plugin.note({conn: connection, pass: 'fcrdns' });
            connection.notes.fcrdns.fcrdns.push(fdom);
        }
        else if ( net_utils.same_ipv4_network(connection.remote_ip, results[fdom]) ) {
            plugin.note({conn: connection, pass: 'fcrdns(same net)' });
            connection.notes.fcrdns.fcrdns.push(fdom);
        }
        else {
            for (var j=0; j<results[fdom].length; j++) {
                connection.notes.fcrdns.other_ips.push(results[fdom[j]]);
            }
        }

        connection.notes.fcrdns.ptr_name_has_ips = true;

        var reject = plugin.is_generic_rdns(connection, fdom);
        if (reject) return do_next(DENY, reject);
    }

    plugin.log_summary(connection);
    plugin.save_auth_results(connection);

    if (!connection.notes.fcrdns.fcrdns.length && reject_no_fcrdns) {
        return do_next(DENY, 'Sorry, no FCrDNS match found');
    }
    return do_next();
};

exports.save_auth_results = function (connection) {
    var note = connection.notes.fcrdns;
    if (note.fcrdns.length) {
        connection.auth_results('iprev=pass');
        return;
    }
    if (!note.has_rdns) {
        connection.auth_results('iprev=permerror');
        return;
    }
    if (note.err.length) {
        connection.auth_results('iprev=temperror');
        return;
    }
    connection.auth_results('iprev=fail');
};

exports.is_generic_rdns = function (connection, domain) {
    // IP in rDNS? (Generic rDNS)
    if (!net_utils.is_ip_in_str(connection.remote_ip, domain)) {
        this.note({conn: connection, pass: 'is_generic_rdns'});
        return false;
    }

    this.note({conn: connection, fail: 'is_generic_rdns'});
    if (!reject_generic_rdns) return false;

    var orgDom = net_utils.getOrganizationalDomain(domain);
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
    var note = connection.notes.fcrdns;

    connection.loginfo(this,
        ['ip=' + connection.remote_ip,
        'rdns="' + ((note.name.length > 2) ? note.name.slice(0,2).join(',') + '...' : note.name.join(',')) + '"',
        'rdns_len=' + note.name.length,
        'fcrdns="' + ((note.fcrdns.length > 2) ? note.fcrdns.slice(0,2).join(',') + '...' : note.fcrdns.join(',')) + '"',
        'fcrdns_len=' + note.fcrdns.length,
        'other_ips_len=' + note.other_ips.length,
        'invalid_tlds=' + note.invalid_tlds.length,
        'generic_rdns=' + ((note.ptr_name_has_ips) ? 'true' : 'false'),
        ].join(' '));
};

