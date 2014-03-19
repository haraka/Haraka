// check rdns against forward

// NOTICE: the functionality of this plugin is duplicated by the
//         FCrDNS plugin. Consider using it instead. This plugin
//         may be deprecated in the future.
//
//         To achieve the same results using FCrDNS (in addition to
//         the additional features), set [reject] no_rdns=true in
//         connect.fcrdns.ini. 
//
//         The FCrDNS plugin uses the white/blacklist functionality in the
//         connect.rdns_access plugin.

var dns = require('dns');

// _dns_error handles err from node.dns callbacks.  It will always call next()
// with a DENYDISCONNECT for this plugin.
function _dns_error(connection, next, err, host, plugin, nxdomain, dnserror) {
    switch (err.code) {
        case dns.NXDOMAIN:
            connection.loginfo(plugin, 'could not find a address for ' + host +
                '. Disconnecting.');
            next(DENYDISCONNECT, 'Sorry we could not find address for ' +
                host + '. ' + nxdomain);
        break;
    
        default:
            connection.loginfo(plugin, 'encountered an error when looking up ' +
                host + '. Disconnecting.');
            next(DENYDISCONNECT, 'Sorry we encountered an error when ' +
                'looking up ' + host + '. ' + dnserror);
        break;
    }
}

function _in_whitelist(connection, plugin, address) {
    var domain          = address.toLowerCase();
    var host_list       =
        plugin.config.get('lookup_rdns.strict.whitelist', 'list');
    var host_list_regex =
        plugin.config.get('lookup_rdns.strict.whitelist_regex', 'list');
    
    connection.logdebug(plugin, "Checking if " + address + " is in the " +
        "lookup_rdns.strict.whitelist files");

    var i;
    for (i in host_list) {
        connection.logdebug(plugin, "checking " + domain + " against " + host_list[i]);

        if (host_list[i].toLowerCase() === domain) {
            connection.logdebug(plugin, "Allowing " + domain);
            return 1;
        }
    }

    if (host_list_regex.length) {
        var regex = new RegExp ('^(?:' + host_list_regex.join('|') + ')$', 'i');

        connection.logdebug(plugin, "checking " + domain + " against " + regex.source);

        if (domain.match(regex)) {
            connection.logdebug(plugin, "Allowing " + domain);
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
    var config       = this.config.get('lookup_rdns.strict.ini');
    var rdns         = '';
    var fwd_nxdomain = config.forward && (config.forward['nxdomain']    || '');
    var fwd_dnserror = config.forward && (config.forward['dnserror']    || '');
    var rev_nxdomain = config.reverse && (config.reverse['nxdomain']    || '');
    var rev_dnserror = config.reverse && (config.reverse['dnserror']    || '');
    var nomatch      = config.general && (config.general['nomatch']     || '');
    var timeout      = config.general && (config.general['timeout']     || 60);
    var timeout_msg  = config.general && (config.general['timeout_msg'] || '');

    if (_in_whitelist(connection, plugin, connection.remote_ip)) {
        called_next++;
        return next(OK, connection.remote_ip);
    }

    timeout_id = setTimeout(function () {
        if (!called_next) {
            connection.loginfo(plugin, 'timed out when looking up ' +
                connection.remote_ip + '. Disconnecting.');
            called_next++;
            next(DENYDISCONNECT, '[' + connection.remote_ip + '] ' +
                timeout_msg);
        }
    }, timeout * 1000);

    dns.reverse(connection.remote_ip, function (err, domains) {
        if (err) {
            if (!called_next) {
                called_next++;
                clearTimeout(timeout_id);
                connection.auth_results("iprev=permerror");
                _dns_error(connection, next, err, connection.remote_ip, plugin,
                    rev_nxdomain, rev_dnserror);
            }
        } else {
            // Anything this strange needs documentation.  Since we are
            // checking M (A) addresses for N (PTR) records, we need to
            // keep track of our total progress.  That way, at the end,
            // we know to send an error of nothing has been found.  Also,
            // on err, this helps us figure out if we still have more to check.
            total_checks = domains.length;

            // Check whitelist before we start doing a bunch more DNS queries.
            for(var i = 0; i < domains.length; i++) {
                if (_in_whitelist(connection, plugin, domains[i])) {
                    called_next++;
                    clearTimeout(timeout_id);
                    return next(OK, domains[i]);
                }
            }

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
                            clearTimeout(timeout_id);
                            connection.auth_results("iprev=fail");
                            _dns_error(connection, next, err, rdns, plugin,
                                fwd_nxdomain, fwd_dnserror);
                        }
                    } else {
                        for (var i = 0; i < addresses.length ; i++) {
                            if (addresses[i] === connection.remote_ip) {
                                // We found a match, call next() and return
                                if (!called_next) {
                                    called_next++;
                                    clearTimeout(timeout_id);
                                    connection.auth_results("iprev=pass");
                                    return next(OK, rdns);
                                }
                            }
                        }

                        if (!called_next && !total_checks) {
                            called_next++;
                            clearTimeout(timeout_id);
                            next(DENYDISCONNECT, rdns + ' [' +
                                connection.remote_ip + '] ' + nomatch);
                        }
                    }
                });
            });
        }
    });
};
