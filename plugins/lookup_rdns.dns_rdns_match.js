// check rdns against forward

var dns = require('dns');

// _dns_error handles err from node.dns callbacks.  It will always call next()
// with a DENYDISCONNECT for this plugin.
function _dns_error(next, err, host, nxdomain, dnserror) {
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

exports.hook_lookup_rdns = function (next, connection) {
    var plugin        = this;
    var config        = this.config.get('dns_rdns_match.ini', 'ini');
    var rdns          = '';
    var fwd_nxdomain  = config.forward && (config.forward['nxdomain'] || '');
    var fwd_dnserror  = config.forward && (config.forward['dnserror'] || '');
    var rev_nxdomain  = config.reverse && (config.reverse['nxdomain'] || '');
    var rev_dnserror  = config.reverse && (config.reverse['dnserror'] || '');
    var nomatch       = config.general && (config.general['nomatch']  || '');
    var total_checks  = 0;
    var called_next   = 0;

    dns.reverse(connection.remote_ip, function (err, domains) {
        if (err) {
            _dns_error(next, err, connection.remote_ip, rev_nxdomain,
                rev_dnserror);
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

                            _dns_error(next, err, rdns, fwd_nxdomain,
                                fwd_dnserror);
                        }
                    } else {
                        for (var i = 0; i < addresses.length ; i++) {
                            if (addresses[i] === connection.remote_ip) {
                                // We found a match, call next() and return
                                if (!called_next) {
                                    called_next++;
                                    next(OK, rdns);
                                    return;
                                }
                            }
                        }

                        if (!called_next && !total_checks) {
                            called_next++;
                            next(DENYDISCONNECT, nomatch);
                        }
                    }
                });
            });
        }
    });
};
