// check rdns against forward

exports.hook_lookup_rdns = function (next, connection)
{
    var config        = this.config.get('dns_rdns_match', 'ini');
    var rdns          = '';
    var fwd_nxdomain  = config.forward && (config.forward['nxdomain'] || '');
    var fwd_dnserror  = config.forward && (config.forward['dnserror'] || '');
    var rev_nxdomain  = config.reverse && (config.reverse['nxdomain'] || '');
    var rev_dnserror  = config.reverse && (config.reverse['dnserror'] || '');
    var nomatch       = config.general && (config.general['nomatch']  || '');
    var type          = config.general && (config.general['type']     || 'A');

    connection.dns.reverse(connection.remote_ip, function(err, domains)
    {
        if (err)
        {
            switch (err.code)
            {
                case dns.NXDOMAIN:
                    // NXDOMAIN
                    plugin.loginfo('could not find a reverse address for ' +
                        connecton.remote_ip + '. Disconnecting.');
                    return next(DENYDISCONNECT, [
                        'Sorry we could not find a reverse address for ' +
                        connecton.remote_ip + '.', rev_nxdomain
                    ]);
                break;

                default:
                    // DNSERROR
                    plugin.loginfo('encountered an error when looking up ' +
                        connecton.remote_ip + '. Disconnecting.');
                    return next(DENYDISCONNECT, [
                        'Sorry we encountered an error when looking up ' +
                        connecton.remote_ip + '.', rev_dnserror
                    ]);
                break;
            }
        }
        else
        {
            // Now we should make sure that the reverse response matches
            // the forward address.  Almost no one will have more than one
            // PTR record for a domain, however, DNS protocol does not
            // restrict one from having multiple PTR records for the same
            // address.  So here we are, dealing with that case.
            domains.forEach(function (dom)
            {
                rdns = dom;
    
                connection.dns.resolve(rdns, type, function(err, addresses)
                {
                    if (err)
                    {
                        switch (err.code)
                        {
                            case dns.NXDOMAIN:
                                // NXDOMAIN
                                plugin.loginfo('could not find address for ' +
                                    rdns + '. Disconnecting.');
                                return next(DENYDISCONNECT, [
                                    'Sorry we could not find address for ' +
                                    rdns + '.', fwd_nxdomain
                                ]);
                            break;
            
                            default:
                                // DNSERROR
                                plugin.loginfo('encountered an error when ' +
                                    'looking up ' + rdns + '. Disconnecting.');
                                return next(DENYDISCONNECT, [
                                    'Sorry we encountered an error when ' +
                                    'looking up ' + rdns + '.', fwd_dnserror
                                ]);
                            break;
                        }
                    }
    
                    addresses.forEach(function (address)
                    {
                        if (address === connection.remote_ip)
                        {
                            // We found a match
                            return next(OK, rdns);
                        }
                    });
                });
            });

            return next(DENYDISCONNECT, nomatch);
        }
    });
};
