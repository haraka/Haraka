var dns = require('dns');
var net = require('net');
var utils = require('./utils');
var net_utils = require('./net_utils.js');

exports.hook_lookup_rdns = function (next, connection) {
    var cfg = this.config.get('rdns.ini');

    connection.notes.rdns = {
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
    var plugin = this;
    var called_next = 0;
    var timer;
    var do_next = function (code, msg) {
        if (!called_next) {
            called_next++;
            clearTimeout(timer);
            return next(code, msg);
        }
    }

    // Set-up timer
    timer = setTimeout(function () {
        connection.logwarn(plugin, 'timeout');
        connection.notes.rdns.timeout = true;
        if (cfg.main.reject_no_rdns) {
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
                    connection.notes.rdns.no_rdns = true;
                    connection.loginfo(plugin, 'no rDNS found (' + err.code + ')');
                    if (cfg.main.reject_no_rdns) {
                        return do_next(DENY, 'client [' + connection.remote_ip + '] rejected; no rDNS entry found');
                    }
                    return do_next();
                    break;
                default:
                    connection.logerror(plugin, 'error: ' + err);
                    connection.notes.rdns.error = true;
                    if (cfg.main.reject_no_rdns) {
                        return do_next(DENYSOFT, 'client [' + connection.remote_ip + '] rDNS lookup error (' + err + ')');
                    }
                    return do_next();
            }
        }
        connection.notes.rdns.name = domains;
        // Fetch all A records for any PTR records returned
        var pending_queries = 0;
        var queries_run = false;
        var results = {};
        for (var i=0; i<domains.length; i++) {
            var rdns = domains[i].toLowerCase();
            results[rdns] = [];
            // Make sure we have a valid TLD
            var tld = rdns.match(/\.([^.]+)$/);
            if (!tld || (tld && !net_utils.top_level_tlds[tld[1]])) {
                connection.logdebug(plugin, 'found invalid TLD: ' + rdns);
                connection.notes.rdns.invalid_tlds.push(rdns);
                if (cfg.main.reject_invalid_tld && !net_utils.is_rfc1918(connection.remote_ip)) {
                    return do_next(DENY, 'client [' + connection.remote_ip + '] rejected; invalid TLD in rDNS (' + rdns + ')');
                }
            }
            else {
                queries_run = true;
                connection.logdebug(plugin, 'rdns: ' + rdns + ' tld=' + tld[1]);
                pending_queries++;
                (function (rdns) {  /* BEGIN BLOCK SCOPE */
                dns.resolve(rdns, function(err, addresses) {
                    pending_queries--;
                    if (err) {
                        connection.logdebug(plugin, rdns + ' => ' + err); 
                    }
                    else {
                        connection.logdebug(plugin, rdns + ' => ' + addresses);
                        results[rdns] = addresses;
                    }
                    if (pending_queries === 0) {
                        // Got all results
                        var keys = Object.keys(results);
                        var other_ips = {};
                        connection.notes.rdns.rdns_name_to_ip = results;
                        for (var i=0; i<keys.length; i++) {
                            // Multiple domains?
                            if (last_domain && last_domain !== net_utils.split_hostname(keys[i])[1]) {
                                connection.notes.rdns.ptr_multidomain = true;
                            }
                            else {
                                var last_domain = net_utils.split_hostname(keys[i])[1];
                            }
                            // FCrDNS? A => PTR => A
                            if (results[keys[i]].indexOf(connection.remote_ip) >= 0) {
                                connection.notes.rdns.fcrdns.push(keys[i]);
                            } else {
                                for (var j=0; j<results[keys[i]].length; j++) {
                                    other_ips[results[keys[i][j]]] = 1;
                                }
                            }
                            // IP in rDNS? (Generic rDNS)
                            if (net_utils.is_ip_in_str(connection.remote_ip, keys[i])) {
                                connection.notes.rdns.ip_in_rdns = true;
                                if (cfg.main.reject_generic_rdns) {
                                    var host_part = net_utils.split_hostname(keys[i])[0];
                                    if (/(?:static|business)/.test(host_part)) {
                                        // Allow some obvious generic but static ranges
                                        // EHLO/HELO checks will still catch out hosts that use generic rDNS there
                                        connection.loginfo(plugin, 'allowing generic static rDNS');
                                    }
                                    else {
                                        return do_next(DENY, 'client ' + keys[i] + ' [' + connection.remote_ip +
                                         '] rejected; generic rDNS,' +
                                         ' please use your ISPs SMTP relay service to send mail here');
                                    }
                                }
                            }
                        }
                        connection.notes.rdns.other_ips = Object.keys(other_ips);
                        connection.loginfo(plugin, 
                            ['ip=' + connection.remote_ip,
                             'rdns="' + ((connection.notes.rdns.name.length > 2) ? connection.notes.rdns.name.slice(0,2).join(',') + '...' : connection.notes.rdns.name.join(',')) + '"',
                             'rdns_len=' + connection.notes.rdns.name.length,
                             'fcrdns="' + ((connection.notes.rdns.fcrdns.length > 2) ? connection.notes.rdns.fcrdns.slice(0,2).join(',') + '...' : connection.notes.rdns.fcrdns.join(',')) + '"',
                             'fcrdns_len=' + connection.notes.rdns.fcrdns.length,
                             'other_ips_len=' + connection.notes.rdns.other_ips.length,
                             'invalid_tlds=' + connection.notes.rdns.invalid_tlds.length,
                             'generic_rdns=' + ((connection.notes.rdns.ip_in_rdns) ? 'true' : 'false'),
                            ].join(' '));
                        return do_next();
                    }   
                });
                })(rdns); /* END BLOCK SCOPE */
            }
        }
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
    if (connection.notes.rdns && !connection.notes.rdns.error) {
        if (connection.notes.rdns.name && connection.notes.rdns.name.length) {
            transaction.add_header('X-Haraka-rDNS', connection.notes.rdns.name.join(' '));
        }
        if (connection.notes.rdns.fcrdns && connection.notes.rdns.fcrdns.length) {
            transaction.add_header('X-Haraka-FCrDNS', connection.notes.rdns.fcrdns.join(' '));
        }
        if (connection.notes.rdns.other_ips && connection.notes.rdns.other_ips.length) {
            transaction.add_header('X-Haraka-rDNS-OtherIPs', connection.notes.rdns.other_ips.join(' '));
        }
    }
    return next();
}
