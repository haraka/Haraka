'use strict';

// Check MAIL FROM domain is resolvable to an MX
const dns = require('dns');
const net = require('net');

const net_utils = require('haraka-net-utils');

exports.register = function () {
    this.load_ini();
}

exports.load_ini = function () {
    this.cfg = this.config.get('mail_from.is_resolvable.ini', {
        booleans: [
            '-main.allow_mx_ip',
            '+main.reject_no_mx',
        ],
    }, () => {
        this.load_ini();
    });

    if (isNaN(this.cfg.main.timeout)) {
        this.cfg.main.timeout = 29;
    }

    if (this.timeout) {
        if (this.timeout <= this.cfg.main.timeout) {
            this.cfg.main.timeout = this.timeout - 1;
            this.logwarn(`reducing plugin timeout to ${this.cfg.main.timeout}s`);
        }
    }

    this.re_bogus_ip = new RegExp(this.cfg.main.re_bogus_ip ||
            '^(?:0\\.0\\.0\\.0|255\\.255\\.255\\.255|127\\.)' );
}

exports.hook_mail = function (next, connection, params) {
    const plugin    = this;
    const mail_from = params[0];
    const txn       = connection?.transaction;
    if (!txn) return next();
    const { results }   = txn;

    // Check for MAIL FROM without an @ first - ignore those here
    if (!mail_from.host) {
        results.add(plugin, {skip: 'null host'});
        return next();
    }

    let called_next  = 0;
    const domain       = mail_from.host;
    const c            = plugin.cfg.main;
    const timeout_id   = setTimeout(() => {
        // DNS answer didn't return (UDP)
        connection.loginfo(plugin, `timed out resolving MX for ${domain}`);
        called_next++;
        if (txn) results.add(plugin, {err: `timeout(${domain})`});
        next(DENYSOFT, 'Temporary resolver error (timeout)');
    }, c.timeout * 1000);

    function mxDone (code, reply) {
        if (called_next) return;
        clearTimeout(timeout_id);
        called_next++;
        next(code, reply);
    }

    // IS: IPv6 compatible
    net_utils.get_mx(domain, (err, addresses) => {
        if (!txn) return;
        if (err && plugin.mxErr(connection, domain, 'MX', err, mxDone)) return;

        if (!addresses || !addresses.length) {
            // Check for implicit MX 0 record
            return plugin.implicit_mx(connection, domain, mxDone);
        }

        // Verify that the MX records resolve to valid addresses
        let records = {};
        let pending_queries = 0;
        function check_results () {
            if (pending_queries !== 0) return;

            records = Object.keys(records);
            if (records?.length) {
                connection.logdebug(plugin, `${domain}: ${records}`);
                results.add(plugin, {pass: 'has_fwd_dns'});
                return mxDone();
            }
            results.add(plugin, {fail: 'has_fwd_dns'});
            return mxDone(((c.reject_no_mx) ? DENY : DENYSOFT),
                'MX without A/AAAA records');
        }

        addresses.forEach(addr => {
            // Handle MX records that are IP addresses
            // This is invalid - but a lot of MTAs allow it.
            if (net_utils.get_ipany_re('^\\[','\\]$','').test(addr.exchange)) {
                connection.logwarn(plugin, `${domain}: invalid MX ${addr.exchange}`);
                if (c.allow_mx_ip) {
                    records[addr.exchange] = 1;
                }
                return;
            }
            pending_queries++;
            net_utils.get_ips_by_host(addr.exchange, (err2, addresses2) => {
                pending_queries--;
                if (!txn) return;
                if (err2 && err2.length === 2) {
                    results.add(plugin, {msg: err2[0].message});
                    connection.logdebug(plugin, `${domain}: MX ${addr.priority} ${addr.exchange} => ${err2[0].message}`);
                    check_results();
                    return;
                }
                connection.logdebug(plugin, `${domain}: MX ${addr.priority} ${addr.exchange} => ${addresses2}`);
                for (const element of addresses2) {
                    // Ignore anything obviously bogus
                    if (net.isIPv4(element)){
                        if (plugin.re_bogus_ip.test(element)) {
                            connection.logdebug(plugin, `${addr.exchange}: discarding ${element}`);
                            continue;
                        }
                    }
                    if (net.isIPv6(element)){
                        if (net_utils.ipv6_bogus(element)) {
                            connection.logdebug(plugin, `${addr.exchange}: discarding ${element}`);
                            continue;
                        }
                    }
                    records[element] = 1;
                }
                check_results();
            });
        });
        // In case we don't run any queries
        check_results();
    });
}

exports.mxErr = function (connection, domain, type, err, mxDone) {

    const txn = connection?.transaction;
    if (!txn) return;

    txn.results.add(this, {msg: `${domain}:${type}:${err.message}`});
    connection.logdebug(this, `${domain}:${type} => ${err.message}`);
    switch (err.code) {
        case dns.NXDOMAIN:
        case dns.NOTFOUND:
        case dns.NODATA:
            // Ignore
            break;
        default:
            mxDone(DENYSOFT, `Temp. resolver error (${err.code})`);
            return true;
    }
    return false;
}

// IS: IPv6 compatible
exports.implicit_mx = function (connection, domain, mxDone) {
    const txn = connection?.transaction;
    if (!txn) return;

    net_utils.get_ips_by_host(domain, (err, addresses) => {
        if (!txn) return;
        if (!addresses || !addresses.length) {
            txn.results.add(this, {fail: 'has_fwd_dns'});
            return mxDone(((this.cfg.main.reject_no_mx) ? DENY : DENYSOFT),
                'No MX for your FROM address');
        }

        connection.logdebug(this, `${domain}: A/AAAA => ${addresses}`);
        let records = {};
        for (const addr of addresses) {
            // Ignore anything obviously bogus
            if (net.isIPv4(addr)) {
                if (this.re_bogus_ip.test(addr)) {
                    connection.logdebug(this, `${domain}: discarding ${addr}`);
                    continue;
                }
            }
            if (net.isIPv6(addr)) {
                if (net_utils.ipv6_bogus(addr)) {
                    connection.logdebug(this, `${domain}: discarding ${addr}`);
                    continue;
                }
            }
            records[addr] = true;
        }

        records = Object.keys(records);
        if (records?.length) {
            txn.results.add(this, {pass: 'implicit_mx'});
            return mxDone();
        }

        txn.results.add(this, {fail: `implicit_mx(${domain})`});
        return mxDone();
    });
}
