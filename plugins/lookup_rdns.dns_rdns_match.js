// check rdns against forward

var dns = require('dns');

// _dns_error handles err from node.dns callbacks.  It will always call next()
// with a DENYDISCONNECT for this plugin.
function _dns_error(next, err, host, plugin, nxdomain, dnserror) {
    switch (err.code) {
        case dns.NXDOMAIN:
            plugin.loginfo('could not find a address for ' + host +
                '. Disconnecting.');
            next(DENYDISCONNECT, 'Sorry we could not find address for ' +
                host + '. ' + nxdomain);
        break;
    
        default:
            plugin.loginfo('encountered an error when looking up ' +
                host + '. Disconnecting.');
            next(DENYDISCONNECT, 'Sorry we encountered an error when ' +
                'looking up ' + host + '. ' + dnserror);
        break;
    }
}

function _in_whitelist(plugin, address) {
    var domain          = address.toLowerCase();
    var host_list       =
        plugin.config.get('lookup_rdns.dns_rdns_match.whitelist', 'list');
    var host_list_regex =
        plugin.config.get('lookup_rdns.dns_rdns_match.whitelist_regex', 'list');
    
    plugin.loginfo("Checking if " + address + " is in the " +
        "lookup_rdns.dns_rdns_match.whitelist files");

    var i;
    for (i in host_list) {
        plugin.logdebug("checking " + domain + " against " + host_list[i]);

        if (host_list[i].toLowerCase() === domain) {
            plugin.logdebug("Allowing " + domain);
            return 1;
        }
    }

    for (i in host_list_regex) {
        plugin.logdebug("checking " + domain + " against " +
            host_list_regex[i]);

        var regex = new RegExp ('^' + host_list_regex[i] + '$', 'i');

        // now we either check for the domain exactly or
        // we turn the line into a regex.  Yes, there is a very
        // very small potential for a literal name to match the
        // regex.
        if (domain.match(regex)) {
            plugin.logdebug("Allowing " + domain);
            return 1;
        }
    }
    
    return 0;
}

exports.hook_lookup_rdns = function (next, connection) {
    var plugin       = this;
    var total_checks = 0;
    var called_next  = 0;
    var timeout_id   = 0;
    var config       = this.config.get('lookup_rdns.dns_rdns_match.ini', 'ini');
    var rdns         = '';
    var fwd_nxdomain = config.forward && (config.forward['nxdomain']    || '');
    var fwd_dnserror = config.forward && (config.forward['dnserror']    || '');
    var rev_nxdomain = config.reverse && (config.reverse['nxdomain']    || '');
    var rev_dnserror = config.reverse && (config.reverse['dnserror']    || '');
    var nomatch      = config.general && (config.general['nomatch']     || '');
    var timeout      = config.general && (config.general['timeout']     || '');
    var timeout_msg  = config.general && (config.general['timeout_msg'] || '');

    timeout_id = setTimeout(function () {
        if (!called_next) {
            plugin.loginfo('timed out when looking up ' +
                connection.remote_ip + '. Disconnecting.');
            called_next++;

            if (_in_whitelist(plugin, connection.remote_ip)) {
                next(OK, connection.remote_ip);
            } else {
                next(DENYDISCONNECT, timeout_msg);
            }
        }
    }, timeout * 1000);

    dns.reverse(connection.remote_ip, function (err, domains) {
        if (err) {
            if (_in_whitelist(plugin, connection.remote_ip)) {
                next(OK, connection.remote_ip);
            } else {
                _dns_error(next, err, connection.remote_ip, plugin,
                    rev_nxdomain, rev_dnserror);
            }
        } else {
            // Anything this strange needs documentation.  Since we are
            // checking M (A) addresses for N (PTR) records, we need to
            // keep track of our total progress.  That way, at the end,
            // we know to send an error of nothing has been found.  Also,
            // on err, this helps us figure out if we still have more to check.
            total_checks = domains.length;

            // Now we should make sure that the reverse response matches
            // the forward address.  Almost no one will have more than one
            // PTR record for a domain, however, DNS protocol does not
            // restrict one from having multiple PTR records for the same
            // address.  So here we are, dealing with that case.
            domains.forEach(function (rdns) {
                dns.resolve4(rdns, function (err, addresses) {
                    total_checks--;

                    if (err) {
                        if (!called_next && !total_checks) {
                            called_next++;

                            if (_in_whitelist(plugin, rdns)) {
                                next(OK, rdns);
                            } else {
                                _dns_error(next, err, rdns, plugin,
                                    fwd_nxdomain, fwd_dnserror);
                            }
                        }
                    } else {
                        for (var i = 0; i < addresses.length ; i++) {
                            if (addresses[i] === connection.remote_ip) {
                                // We found a match, call next() and return
                                if (!called_next) {
                                    called_next++;
                                    return next(OK, rdns);
                                }
                            }
                        }

                        if (!called_next && !total_checks) {
                            called_next++;
                            if (_in_whitelist(plugin, rdns)) {
                                next(OK, rdns);
                            } else {
                                next(DENYDISCONNECT, nomatch);
                            }
                        }
                    }
                });
            });
        }
    });
};
