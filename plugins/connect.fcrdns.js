var dns = require('dns');
var net = require('net');
var utils = require('./utils');
var net_utils = require('./net_utils.js');

exports.hook_lookup_rdns = function (next, connection) {
    var cfg = this.config.get('connect.fcrdns.ini');

    connection.notes.fcrdns = {
        name: [],
        rdns_name_to_ip: {},    // Array of all rDNS names and their IP addresses
        fcrdns: [],             // Array of rDNS names that verify to this IP
        other_ips: [],          // Array of IPs from rDNS names that did not match our IP
        invalid_tlds: [],       // rDNS names with invalid TLDs
        no_rdns: false,         // Host has no rDNS
        ip_in_rdns: false,      // rDNS name contains host IP address
        ptr_multidomain: false, // Multiple rDNS names in different domains
        timeout: false,         // Timeout during lookups
        error: false,           // DNS error during rDNS lookup
    };
    var reject_no_rdns = cfg.main.reject_no_rdns || 0;
    var reject_invalid_tld = cfg.main.reject_invalid_tld || 0;
    var reject_generic_rdns = cfg.main.reject_generic_rdns || 0;
    // allow rdns_acccess whitelist to override
    if ( connection.notes.rdns_access && connection.notes.rdns_access === 'white' ) {
        reject_no_rdns = 0;
        reject_invalid_tld = 0;
        reject_generic_rdns = 0;
    };
    var plugin = this;
    var called_next = 0;
    var timer;
    var do_next = function (code, msg) {
        if (called_next) return;
        called_next++;
        clearTimeout(timer);
        return next(code, msg);
    }

    // Set-up timer
    timer = setTimeout(function () {
        connection.logwarn(plugin, 'timeout');
        connection.notes.fcrdns.timeout = true;
        if (reject_no_rdns) {
            return do_next(DENYSOFT, 'client [' + connection.remote_ip + '] rDNS lookup timeout');
        }
        return do_next();
    }, 30 * 1000);

    dns.reverse(connection.remote_ip, function (err, domains) {
        connection.logdebug(plugin, 'lookup: ' + connection.remote_ip);
        if (err) {
            switch (err.code) {
                case 'ENOTFOUND':
                case dns.NOTFOUND:
                case dns.NXDOMAIN:
                    connection.notes.fcrdns.no_rdns = true;
                    connection.loginfo(plugin, 'no rDNS found (' + err.code + ')');
                    if (reject_no_rdns) {
                        return do_next(DENY, 'client [' + connection.remote_ip + '] rejected; no rDNS entry found');
                    }
                    return do_next();
                    break;
                default:
                    connection.logerror(plugin, 'error: ' + err);
                    connection.notes.fcrdns.error = true;
                    if (reject_no_rdns) {
                        return do_next(DENYSOFT, 'client [' + connection.remote_ip + '] rDNS lookup error (' + err + ')');
                    }
                    return do_next();
            }
        }
        connection.notes.fcrdns.name = domains;
        // Fetch all A records for any PTR records returned
        var pending_queries = 0;
        var queries_run = false;
        var results = {};
        for (var i=0; i<domains.length; i++) {
            var domain = domains[i].toLowerCase();
            results[domain] = [];
            // Make sure TLD is valid
            if ( !net_utils.getOrganizationalDomain(domain) ) {
                connection.logdebug(plugin, 'invalid TLD in hostname ' + domain);
                connection.notes.fcrdns.invalid_tlds.push(domain);
                if (reject_invalid_tld && !net_utils.is_rfc1918(connection.remote_ip)) {
                    return do_next(DENY, 'client [' + connection.remote_ip + '] rejected; invalid TLD in rDNS (' + domain + ')');
                }
            }
            else {
                queries_run = true;
                connection.logdebug(plugin, 'domain: ' + domain);
                pending_queries++;
                (function (domain) {  /* BEGIN BLOCK SCOPE */
                dns.resolve(domain, function(err, ips_from_fwd) {
                    pending_queries--;
                    if (err) {
                        connection.logdebug(plugin, domain + ' => ' + err);
                    }
                    else {
                        connection.logdebug(plugin, domain + ' => ' + ips_from_fwd);
                        results[domain] = ips_from_fwd;
                    }
                    if (pending_queries === 0) {
                        // Got all results
                        var found_doms = Object.keys(results);
                        var other_ips = {};
                        connection.notes.fcrdns.rdns_name_to_ip = results;
                        for (var i=0; i<found_doms.length; i++) {
                            var fdom = found_doms[i];       // mail.example.com
                            var org_domain = net_utils.getOrganizationalDomain(fdom); // example.com

                            // Multiple domains?
                            if (last_domain && last_domain !== org_domain) {
                                connection.notes.fcrdns.ptr_multidomain = true;
                            }
                            else {
                                var last_domain = org_domain;
                            }
                            // FCrDNS? PTR -> (A | AAAA) 3. PTR comparison
                            if (results[fdom].indexOf(connection.remote_ip) >= 0) {
                                connection.notes.fcrdns.fcrdns.push(fdom);
                            }
                            else if ( net_utils.sameNetwork(connection.remote_ip, results[fdom]) ) {
                                connection.notes.fcrdns.fcrdns.push(fdom);
                            }
                            else {
                                for (var j=0; j<results[fdom].length; j++) {
                                    other_ips[results[fdom[j]]] = 1;
                                }
                            }

                            var reject = isGeneric_rDNS(fdom);
                            if (reject) return do_next(DENY, reject);
                        }

                        toConnectionNote(other_ips);
                        toAuthResults();
                        return do_next();
                    }
                });
                })(domain); /* END BLOCK SCOPE */
            }
        }

        function toAuthResults() {
            var note = connection.notes.fcrdns;
            if (note.fcrdns.length) {
                connection.auth_results("iprev=pass");
                return;
            };
            if (note.no_rdns) {
                connection.auth_results("iprev=permerror");
                return;
            };
            if (note.timeout) {
                connection.auth_results("iprev=temperror");
                return;
            };
            connection.auth_results("iprev=fail");
        };

        function toConnectionNote(other_ips) {
            var note = connection.notes.fcrdns;

            connection.notes.fcrdns.other_ips = Object.keys(other_ips);
            connection.loginfo(plugin,
                ['ip=' + connection.remote_ip,
                    'rdns="' + ((note.name.length > 2) ? note.name.slice(0,2).join(',') + '...' : note.name.join(',')) + '"',
                    'rdns_len=' + note.name.length,
                    'fcrdns="' + ((note.fcrdns.length > 2) ? note.fcrdns.slice(0,2).join(',') + '...' : note.fcrdns.join(',')) + '"',
                    'fcrdns_len=' + note.fcrdns.length,
                    'other_ips_len=' + note.other_ips.length,
                    'invalid_tlds=' + note.invalid_tlds.length,
                    'generic_rdns=' + ((note.ip_in_rdns) ? 'true' : 'false'),
                ].join(' '));
        };

        function isGeneric_rDNS (domain) {
            // IP in rDNS? (Generic rDNS)
            if (!net_utils.is_ip_in_str(connection.remote_ip, domain)) return;

            connection.notes.fcrdns.ip_in_rdns = true;
            if (!reject_generic_rdns) return;

            var orgDom = net_utils.getOrganizationalDomain(name);
            var host_part = domain.slice(0,orgDom.split('.').length);
            if (/(?:static|business)/.test(host_part)) {
                // Allow some obvious generic but static ranges
                // EHLO/HELO checks will still catch out hosts that use generic rDNS there
                connection.loginfo(plugin, 'allowing generic static rDNS');
                return;
            }

            return 'client ' + domain + ' [' + connection.remote_ip +
                '] rejected; generic rDNS, please use your ISPs SMTP relay';
        };

        // No valid PTR
        if (!queries_run || (queries_run && pending_queries === 0)) {
            return do_next();
        }
    });
}

exports.hook_data_post = function (next, connection) {
    var transaction = connection.transaction;
    transaction.remove_header('X-Haraka-rDNS');
    transaction.remove_header('X-Haraka-FCrDNS');
    transaction.remove_header('X-Haraka-rDNS-OtherIPs');
    transaction.remove_header('X-Haraka-HostID');

    if (!connection.notes.fcrdns) return next();

    var note = connection.notes.fcrdns;
    if (note.error) return next();

    if (note.name && note.name.length) {
        transaction.add_header('X-Haraka-rDNS', note.name.join(' '));
    }
    if (note.fcrdns && note.fcrdns.length) {
        transaction.add_header('X-Haraka-FCrDNS', note.fcrdns.join(' '));
    }
    if (note.other_ips && note.other_ips.length) {
        transaction.add_header('X-Haraka-rDNS-OtherIPs', note.other_ips.join(' '));
    }
    return next();
}
