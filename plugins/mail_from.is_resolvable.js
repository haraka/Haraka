'use strict'

// Check MAIL FROM domain is resolvable to an MX
const net = require('node:net')
const net_utils = require('haraka-net-utils')

exports.register = function () {
    this.load_ini()
}

exports.load_ini = function () {
    this.cfg = this.config.get('mail_from.is_resolvable.ini', {
        booleans: [
            '-main.allow_mx_ip',
            '+reject.no_mx',
        ],
    }, () => {
        this.load_ini()
    })

    // compat. Sunset 4.0
    if (this.cfg.main.reject_no_mx) {
        this.cfg.reject.no_mx = this.cfg.main.reject_no_mx
    }

    this.re_bogus_ip = new RegExp(this.cfg.main.re_bogus_ip ||
            '^(?:0\\.0\\.0\\.0|255\\.255\\.255\\.255|127\\.)' )
}

exports.hook_mail = async function (next, connection, params) {
    const mail_from = params[0]
    const {results} = connection.transaction

    // ignore MAIL FROM without an @
    if (!mail_from.host) {
        results.add(this, {skip: 'null host'})
        return next()
    }

    const domain = mail_from.host

    connection.logdebug(this, `resolving MX for domain ${domain}`)

    let exchanges
    try {
        exchanges = await net_utils.get_mx(domain)
    }
    catch (err) {
        connection.logwarn(this, `Temporary resolver error: ${err.code}`)
        results.add(this, {err: `${domain}:${err.message}`})
        return next(DENYSOFT, `Temp. resolver error (${err.code})`)
    }

    connection.logdebug(this, `${domain}: MX => ${JSON.stringify(exchanges)}`)

    if (!exchanges || !exchanges.length) {
        results.add(this, {fail: 'has_fwd_dns', emit: true})
        return next(
            ((this.cfg.reject.no_mx) ? DENY : DENYSOFT),
            'No MX for your FROM address'
        )
    }

    if (this.cfg.main.allow_mx_ip) {
        for (const mx of exchanges) {
            if ((net.isIPv4(mx.exchange) && !this.re_bogus_ip.test(mx.exchange)) ||
                (net.isIPv6(mx.exchange) && !net_utils.ipv6_bogus(mx.exchange))) {
                results.add(this, {pass: 'implicit_mx', emit: true})
                return next()
            }
        }
    }

    // filter out the implicit MX and resolve the remaining MX hostnames
    const mx_hostnames = exchanges.filter(a => (a.exchange && !net.isIP(a.exchange)))
    if (mx_hostnames.length) {
        try {
            const resolved = await net_utils.resolve_mx_hosts(mx_hostnames)
            connection.logdebug(this, `resolved MX => ${JSON.stringify(resolved)}`)
            if (resolved.length) {
                for (const mx of resolved) {
                    if ((net.isIPv4(mx.exchange) && !this.re_bogus_ip.test(mx.exchange)) ||
                        (net.isIPv6(mx.exchange) && !net_utils.ipv6_bogus(mx.exchange))) {
                        results.add(this, {pass: 'has_fwd_dns', emit: true})
                        return next()
                    }
                }
            }
        }
        catch (err) {
            // resolve_mx_hosts ignores errors so this is unlikely to happen
            connection.logwarn(this, `Temp. resolver error: ${err.code}`)
            results.add(this, {err: `${domain}:${err.message}`})
            return next(DENYSOFT, `Temp. resolver error (${err.code})`)
        }
    }

    results.add(this, {fail: 'has_fwd_dns', emit: true})
    return next(
        ((this.cfg.reject.no_mx) ? DENY : DENYSOFT),
        'No valid MX for your FROM address'
    )
}
