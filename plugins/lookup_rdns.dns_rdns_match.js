// check rdns against forward

var dns = require('dns');

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

    dns.reverse(connection.remote_ip, function(err, domains) {
        if (err) {
           switch (err.code) {
               case dns.NXDOMAIN:
                   // NXDOMAIN
                   plugin.loginfo('could not find a reverse address for ' +
                       connection.remote_ip + '. Disconnecting.');
                   return next(DENYDISCONNECT, [
                       'Sorry we could not find a reverse address for ' +
                       connection.remote_ip + '. ' + rev_nxdomain
                   ]);
               break;

               default:
                   // DNSERROR
                   plugin.loginfo('encountered an error when looking up ' +
                       connection.remote_ip + '. Disconnecting.');
                   return next(DENYDISCONNECT, [
                       'Sorry we encountered an error when looking up ' +
                       connection.remote_ip + '. ' + rev_dnserror
                   ]);
               break;
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
                dns.resolve4(rdns, function(err, addresses) {
                    total_checks--;

                    if (err) {
                        if (!called_next && !total_checks) {
                            called_next++;

                            switch (err.code) {
                                case dns.NXDOMAIN:
                                    // NXDOMAIN
                                    plugin.loginfo('could not find address ' +
                                        'for ' + rdns + '. Disconnecting.');
                                    return next(DENYDISCONNECT, [
                                        'Sorry we could not find address for ' +
                                        rdns + '. ' + fwd_nxdomain
                                    ]);
                                break;
                
                                default:
                                    // DNSERROR
                                    plugin.loginfo('encountered an error ' +
                                        'when looking up ' + rdns +
                                        '. Disconnecting.');
                                    return next(DENYDISCONNECT, [
                                        'Sorry we encountered an error when ' +
                                        'looking up ' + rdns + '. ' +
                                        fwd_dnserror
                                    ]);
                                break;
                            }
                        }
                    } else {
                        for (var i = 0; i < addresses.length ; i++) {
                            if (addresses[i] === connection.remote_ip) {
                                // We found a match
                                if (!called_next) {
                                   called_next++;
                                   return next(OK, rdns);
                                }
                            }
                        }

                        if (!called_next && !total_checks) {
                            called_next++;
                            return next(DENYDISCONNECT, nomatch);
                        }
                    }
                });
            });
        }
    });
};
