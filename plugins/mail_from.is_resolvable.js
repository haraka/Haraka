'use strict';
// Check MAIL FROM domain is resolvable to an MX
var dns = require('dns');

exports.register = function () {
    this.load_ini();
};

exports.load_ini = function () {
    var plugin = this;
    plugin.cfg = plugin.config.get('mail_from.is_resolvable.ini', {
        booleans: [
            '-main.allow_mx_ip',
            '+main.reject_no_mx',
            ],
    }, function () {
        plugin.load_ini();
    });

    plugin.re_bogus_ip = new RegExp(plugin.cfg.main.re_bogus_ip ||
            '^(?:0\\.0\\.0\\.0|255\\.255\\.255\\.255|127\\.)' );
};

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
    var c            = plugin.cfg.main;
    var timeout_id   = setTimeout(function () {
        // DNS answer didn't return (UDP)
        connection.loginfo(plugin, 'timed out resolving MX for ' + domain);
        called_next++;
        results.add(plugin, {err: 'timeout(' + domain + ')'});
        return next(DENYSOFT, 'Temporary resolver error (timeout)');
    }, ((c.timeout) ? c.timeout : 30) * 1000);

    var mxDone = function (code, reply) {
        if (called_next) return;
        clearTimeout(timeout_id);
        called_next++;
        next(code, reply);
    };

    dns.resolveMx(domain, function(err, addresses) {
        if (err && plugin.mxErr(connection, domain, 'MX', err, mxDone)) return;

        if (!addresses || !addresses.length) {
            // Check for implicit MX 0 record
            return plugin.implicit_mx(connection, domain, mxDone);
        }

        // Verify that the MX records resolve to valid addresses
        var a_records = {};
        var pending_queries = 0;
        function check_results () {
            if (pending_queries !== 0) return;
            a_records = Object.keys(a_records);
            if (a_records && a_records.length) {
                connection.logdebug(plugin, domain + ': ' + a_records);
                results.add(plugin, {pass: 'has_a_records'});
                return mxDone();
            }
            results.add(plugin, {fail: 'has_a_records'});
            return mxDone(((c.reject_no_mx) ? DENY : DENYSOFT),
                    'MX without A records');
        }

        addresses.forEach(function (addr) {
            // Handle MX records that are IP addresses
            // This is invalid - but a lot of MTAs allow it.
            if (/^\d+\.\d+\.\d+\.\d+$/.test(addr.exchange)) {
                connection.logwarn(plugin, domain + ': invalid MX ' +
                        addr.exchange);
                if (c.allow_mx_ip) {
                    a_records[addr.exchange] = 1;
                }
                return;
            }
            pending_queries++;
            dns.resolve(addr.exchange, function(err, addresses) {
                pending_queries--;
                if (err) {
                    results.add(plugin, {msg: err.message});
                    connection.logdebug(plugin, domain + ': MX ' +
                            addr.priority + ' ' + addr.exchange +
                            ' => ' + err.message);
                    check_results();
                    return;
                }
                connection.logdebug(plugin, domain + ': MX ' + addr.priority +
                        ' ' + addr.exchange + ' => ' + addresses);
                for (var i=0; i < addresses.length; i++) {
                    // Ignore anything obviously bogus
                    if (plugin.re_bogus_ip.test(addresses[i])) {
                        connection.logdebug(plugin, addr.exchange +
                                ': discarding ' + addresses[i]);
                        continue;
                    }
                    a_records[addresses[i]] = 1;
                }
                check_results();
            });
        });
        // In case we don't run any queries
        check_results();
    });
};

exports.mxErr = function (connection, domain, type, err, mxDone) {
    var plugin = this;
    connection.transaction.results.add(plugin,
            {msg: domain + ':' + type + ':' + err.message});
    connection.logdebug(plugin, domain + ':' + type + ' => ' + err.message);
    switch (err.code) {
        case 'NXDOMAIN':
        case 'ENOTFOUND':
        case 'ENODATA':
            // Ignore
            break;
        default:
            mxDone(DENYSOFT, 'Temp. resolver error (' + err.code + ')');
            return true;
    }
    return false;
};

exports.implicit_mx = function (connection, domain, mxDone) {
    var plugin = this;
    var txn = connection.transaction;
    dns.resolve(domain, 'A', function(err, addresses) {
        if (err && plugin.mxErr(connection, domain, 'A', err, mxDone)) return;

        if (!addresses || !addresses.length) {
            txn.results.add(plugin, {fail: 'has_a_records'});
            return mxDone(((plugin.cfg.main.reject_no_mx) ? DENY : DENYSOFT),
                    'No MX for your FROM address');
        }

        connection.logdebug(plugin, domain + ': A => ' + addresses);
        var a_records = {};
        for (var i=0; i < addresses.length; i++) {
            var addr = addresses[i];
            // Ignore anything obviously bogus
            if (plugin.re_bogus_ip.test(addr)) {
                connection.logdebug(plugin, domain + ': discarding ' + addr);
                continue;
            }
            a_records[addr] = true;
        }

        a_records = Object.keys(a_records);
        if (a_records && a_records.length) {
            txn.results.add(plugin, {pass: 'implicit_mx'});
            return mxDone();
        }

        txn.results.add(plugin, {fail: 'implicit_mx('+domain+')'});
        return mxDone();
    });
};
