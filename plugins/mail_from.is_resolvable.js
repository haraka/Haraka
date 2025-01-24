'use strict';

// Check MAIL FROM domain is resolvable to an MX
const net = require('node:net');
const net_utils = require('haraka-net-utils');

exports.register = function () {
    this.load_ini();
}

exports.load_ini = function () {
    this.cfg = this.config.get('mail_from.is_resolvable.ini', {
        booleans: [
            '-main.allow_mx_ip',
            '+reject.no_mx',
        ],
    }, () => {
        this.load_ini();
    });

    // compat. Sunset 4.0
    if (this.cfg.main.reject_no_mx) {
        this.cfg.reject.no_mx = this.cfg.main.reject_no_mx
    }

    this.re_bogus_ip = new RegExp(this.cfg.main.re_bogus_ip ||
            '^(?:0\\.0\\.0\\.0|255\\.255\\.255\\.255|127\\.)' );
}

exports.hook_mail = async function (next, connection, params) {
    const plugin = this;
    const mail_from = params[0];
    const txn = connection?.transaction;
    if (!txn) return next();
    const { results } = txn;

    // ignore MAIL FROM without an @
    if (!mail_from.host) {
        results.add(plugin, {skip: 'null host'});
        return next();
    }

    const domain = mail_from.host;

    function mxErr (err) {
        results.add(plugin, {err: `${domain}:${err.message}`});
        return next(DENYSOFT, `Temp. resolver error (${err.code})`);
    }

    connection.loginfo(plugin, `resolving MX for domain ${domain}`)

    net_utils
        .get_mx(domain)
        .then((exchanges) => {
            if (!txn) return;

            connection.loginfo(plugin, `${domain}: MX => ${JSON.stringify(exchanges)}`)

            if (!exchanges || !exchanges.length) {
                results.add(this, {fail: 'has_fwd_dns'});
                return next(
                    ((this.cfg.reject.no_mx) ? DENY : DENYSOFT),
                    'No MX for your FROM address'
                );
            }

            if (this.cfg.main.allow_mx_ip) {
                for (const mx of exchanges) {
                    if (net.isIPv4(mx.exchange) && !this.re_bogus_ip.test(mx.exchange)) {
                        txn.results.add(this, {pass: 'implicit_mx', emit: true});
                        return next()
                    }
                    if (net.isIPv6(mx.exchange) && !net_utils.ipv6_bogus(mx.exchange)) {
                        txn.results.add(this, {pass: 'implicit_mx', emit: true});
                        return next()
                    }
                }
            }

            // filter out the implicit MX and resolve the MX hostnames
            net_utils
                .resolve_mx_hosts(exchanges.filter(a => !net.isIP(a.exchange)))
                .then(resolved => {
                    connection.loginfo(plugin, `resolved MX => ${JSON.stringify(resolved)}`);

                    for (const mx of resolved) {
                        if (net.isIPv4(mx.exchange) && !this.re_bogus_ip.test(mx.exchange)) {
                            txn.results.add(this, {pass: 'has_fwd_dns', emit: true});
                            return next()
                        }
                        if (net.isIPv6(mx.exchange) && !net_utils.ipv6_bogus(mx.exchange)) {
                            txn.results.add(this, {pass: 'has_fwd_dns', emit: true});
                            return next()
                        }
                    }

                    return next(
                        ((this.cfg.reject.no_mx) ? DENY : DENYSOFT),
                        'No valid MX for your FROM address'
                    );
                })
                .catch(mxErr)
        })
        .catch(mxErr)
}
