// Check MAIL FROM domain is resolvable to an MX
var dns = require('dns');

exports.hook_mail = function(next, connection, params) {
    var plugin    = this;
    var mail_from = params[0];
    var results   = connection.transaction.results;

    // Check for MAIL FROM without an @ first - ignore those here
    if (!mail_from.host) {
        results.add(plugin, {skip: 'null host'});
        return next();
    }

    var called_next  = 0;
    var domain       = mail_from.host;
    var config       = plugin.config.get('mail_from.is_resolvable.ini');
    var re_bogus_ip  = new RegExp(config.main.re_bogus_ip || '^(?:0\.0\.0\.0|255\.255\.255\.255|127\.)' );

    // Just in case DNS never comes back (UDP), we should DENYSOFT.
    var timeout_id = setTimeout(function () {
        connection.loginfo(plugin, 'timed out when looking up MX for ' + domain);
        called_next++;
        results.add(plugin, {err: 'timeout(' + domain + ')'});
        return next(DENYSOFT, 'Temporary resolver error (timeout)');
    }, ((config.main.timeout) ? config.main.timeout : 30) * 1000);

    var cb = function (code, reply) {
        if (!called_next) {
            clearTimeout(timeout_id);
            called_next++;
            next(code, reply);
        }
    };

    dns.resolveMx(domain, function(err, addresses) {
        if (err) {
            results.add(plugin, {msg: err.message});
            connection.logdebug(plugin, domain + ': MX => ' + err.message);
            switch (err.code) {
                case dns.NXDOMAIN:
                case 'ENOTFOUND':
                case 'ENODATA':
                    // Ignore these as they are not 'temporary'
                    // In this case we need to look up the implicit MX
                    break;
                default:
                    return cb(DENYSOFT, 'Temporary resolver error (' +
                                          err.code + ')');
            }
        }
        if (addresses && addresses.length) {
            // Verify that the MX records resolve to valid addresses
            var a_records = {};
            var pending_queries = 0;
            var check_results = function () {
                a_records = Object.keys(a_records);
                if (a_records && a_records.length) {
                    connection.logdebug(plugin, domain + ': ' + a_records);
                    results.add(plugin, {pass: 'has_a_records'});
                    return cb();
                }
                results.add(plugin, {fail: 'has_a_records'});
                return cb(((config.main.reject_no_mx) ? DENY : DENYSOFT),
                            'No MX for your FROM address');
            };

            addresses.forEach(function (addr) {
                // Handle MX records that are IP addresses
                // This is invalid - but a lot of MTAs allow it.
                if (/^\d+\.\d+\.\d+\.\d+$/.test(addr.exchange)) {
                   connection.logwarn(plugin, domain + ': invalid MX ' + addr.exchange);
                   if (config.main.allow_mx_ip) {
                       a_records[addr.exchange] = 1;
                   }
                   return;
                } 
                pending_queries++;
                dns.resolve(addr.exchange, function(err, addresses) {
                    pending_queries--;
                    if (err) {
                        results.add(plugin, {msg: err.message});
                        connection.logdebug(plugin, domain + ': MX ' + addr.priority + ' ' +
                                        addr.exchange + ' => ' + err.message);
                    }
                    else {
                        connection.logdebug(plugin, domain + ': MX ' + addr.priority + ' ' +
                                        addr.exchange + ' => ' + addresses);
                        for (var i=0; i < addresses.length; i++) {
                            // Ignore anything obviously bogus
                            if (re_bogus_ip.test(addresses[i])) {
                                connection.logdebug(plugin, addr.exchange + ': discarding ' + addresses[i]);
                                continue;
                            }
                            a_records[addresses[i]] = 1;
                        }
                    }
                    if (pending_queries === 0) {
                        check_results();
                    }
                });
            });
            // In case we don't run any queries
            if (pending_queries === 0) {
                check_results();
            }
        } 
        else {
            // Check for implicit MX 0 record
            dns.resolve(domain, function(err, addresses) {
                if (err) {
                    results.add(plugin, {msg: domain + ':A:' + err.message});
                    connection.logdebug(plugin, domain + ': A => ' + err.message);
                    switch (err.code) {
                        case dns.NXDOMAIN:
                        case 'ENOTFOUND':
                        case 'ENODATA':
                            // Ignore
                            break;
                        default:
                            return cb(DENYSOFT, 'Temporary resolver error (' +
                                                        err.code + ')');
                    }
                }
                if (addresses && addresses.length) {
                    connection.logdebug(plugin, domain + ': A => ' + addresses);
                    var a_records = {};
                    for (var i=0; i < addresses.length; i++) {
                        // Ignore anything obviously bogus
                        if (re_bogus_ip.test(addresses[i])) {
                            connection.logdebug(plugin, domain + ': discarding ' + addresses[i]);
                            continue;
                        }
                        a_records[addresses[i]] = 1;
                    }
                    a_records = Object.keys(a_records);
                    if (a_records && a_records.length) {
                        results.add(plugin, {pass: 'has_a_records'});
                        return cb();
                    }
                } 
                results.add(plugin, {fail: 'has_a_records'});
                return cb(((config.main.reject_no_mx) ? DENY : DENYSOFT), 
                            'No MX for your FROM address');
            });
        }
    });
};
