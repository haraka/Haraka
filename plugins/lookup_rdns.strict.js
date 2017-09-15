// check rdns against forward

// NOTICE: the functionality of this plugin is duplicated by the
//         FCrDNS plugin. Consider using it instead. This plugin
//         may be deprecated in the future.
//
//         To achieve the same results using FCrDNS (in addition to
//         the additional features), set [reject] no_rdns=true in
//         fcrdns.ini.
//
//         The FCrDNS plugin uses the white/blacklist functionality in the
//         access plugin.

const dns = require('dns');

const net_utils = require('haraka-net-utils');

// _dns_error handles err from node.dns callbacks.  It will always call next()
// with a DENYDISCONNECT for this plugin.
function _dns_error (connection, next, err, host, plugin, nxdomain, dnserror) {
    switch (err.code) {
        case dns.NXDOMAIN:
        case dns.NOTFOUND:
        case dns.NOTDATA:
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

function _in_whitelist (connection, plugin, address) {
    const domain          = address.toLowerCase();
    const host_list       =
        plugin.config.get('lookup_rdns.strict.whitelist', 'list');
    const host_list_regex =
        plugin.config.get('lookup_rdns.strict.whitelist_regex', 'list');

    connection.logdebug(plugin, "Checking if " + address + " is in the " +
        "lookup_rdns.strict.whitelist files");

    let i;
    for (i in host_list) {
        connection.logdebug(plugin, "checking " + domain + " against " +
                host_list[i]);

        if (host_list[i].toLowerCase() === domain) {
            connection.logdebug(plugin, "Allowing " + domain);
            return 1;
        }
    }

    if (host_list_regex.length) {
        const regex = new RegExp ('^(?:' + host_list_regex.join('|') + ')$', 'i');

        connection.logdebug(plugin, "checking " + domain + " against " +
                regex.source);

        if (domain.match(regex)) {
            connection.logdebug(plugin, "Allowing " + domain);
            return 1;
        }
    }

    return 0;
}

exports.hook_lookup_rdns = function (next, connection) {
    const plugin       = this;
    let total_checks = 0;
    let called_next  = 0;
    let timeout_id   = 0;
    const config       = this.config.get('lookup_rdns.strict.ini');
    const fwd_nxdomain = config.forward && (config.forward.nxdomain    || '');
    const fwd_dnserror = config.forward && (config.forward.dnserror    || '');
    const rev_nxdomain = config.reverse && (config.reverse.nxdomain    || '');
    const rev_dnserror = config.reverse && (config.reverse.dnserror    || '');
    const nomatch      = config.general && (config.general.nomatch     || '');
    const timeout      = config.general && (config.general.timeout     || 60);
    const timeout_msg  = config.general && (config.general.timeout_msg || '');

    if (_in_whitelist(connection, plugin, connection.remote.ip)) {
        called_next++;
        return next(OK, connection.remote.ip);
    }

    const call_next = function (code, msg) {
        clearTimeout(timeout_id);
        if (called_next) return;
        called_next++;
        next(code, msg);
    };

    timeout_id = setTimeout(function () {
        connection.loginfo(plugin, 'timed out when looking up ' +
            connection.remote.ip + '. Disconnecting.');
        call_next(DENYDISCONNECT,
            '[' + connection.remote.ip + '] ' + timeout_msg);
    }, timeout * 1000);

    dns.reverse(connection.remote.ip, function (err, domains) {
        if (err) {
            if (!called_next) {
                connection.auth_results("iprev=permerror");
                _dns_error(connection, call_next, err, connection.remote.ip,
                    plugin, rev_nxdomain, rev_dnserror);
            }
            return;
        }

        // Anything this strange needs documentation.  Since we are
        // checking M (A) addresses for N (PTR) records, we need to
        // keep track of our total progress.  That way, at the end,
        // we know to send an error of nothing has been found.  Also,
        // on err, this helps us figure out if we still have more to check.
        total_checks = domains.length;

        // Check whitelist before we start doing a bunch more DNS queries.
        for (let i = 0; i < domains.length; i++) {
            if (_in_whitelist(connection, plugin, domains[i])) {
                return call_next(OK, domains[i]);
            }
        }

        // Now we should make sure that the reverse response matches
        // the forward address.  Almost no one will have more than one
        // PTR record for a domain, however, DNS protocol does not
        // restrict one from having multiple PTR records for the same
        // address.  So here we are, dealing with that case.
        domains.forEach(function (rdns2) {
            net_utils.get_ips_by_host(rdns2, function (err2, addresses) {
                total_checks--;

                if (err2 && err2.length) {
                    if (!called_next && !total_checks) {
                        connection.auth_results("iprev=fail");
                        _dns_error(connection, call_next, err2[0], rdns2, plugin,
                            fwd_nxdomain, fwd_dnserror);
                    }
                    return;
                }
                for (let j = 0; j < addresses.length ; j++) {
                    if (addresses[j] === connection.remote.ip) {
                        // We found a match, call next() and return
                        if (!called_next) {
                            connection.auth_results("iprev=pass");
                            return call_next(OK, rdns2);
                        }
                    }
                }

                if (!called_next && !total_checks) {
                    call_next(DENYDISCONNECT, rdns2 + ' [' +
                        connection.remote.ip + '] ' + nomatch);
                }
            });
        });
    });
};
