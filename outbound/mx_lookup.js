"use strict";

const dns        = require('node:dns').promises;
const net_utils  = require('haraka-net-utils')

exports.lookup_mx = async function lookup_mx (domain, cb) {
    const mxs = [];

    // Possible DNS errors
    // NODATA
    // FORMERR
    // BADRESP
    // NOTFOUND
    // BADNAME
    // TIMEOUT
    // CONNREFUSED
    // NOMEM
    // DESTRUCTION
    // NOTIMP
    // EREFUSED
    // SERVFAIL

    try {
        const addresses = await net_utils.get_mx(domain)
        for (const a of addresses) {
            mxs.push(a);
        }
        if (mxs.length) {
            if (cb) return cb(null, mxs)
            return mxs
        }
    }
    catch (err) {
        switch (err.code) {
            case 'ENODATA':
            case 'ENOTFOUND':
                // likely a hostname with no MX record, drop through
                break
            default:
                throw err(err)
        }
    }

    // No MX record, try resolving A record

    // wrap addresses with "priority" and "exchange" keys
    const wrap_mx = a => ({priority:0,exchange:a});

    const addresses = await dns.resolve(domain)
    for (const a of addresses) {
        mxs.push(wrap_mx(a));
    }

    if (mxs.length) {
        if (cb) return cb(null, mxs)
        return mxs
    }

    const err = new Error("Found nowhere to deliver to");
    err.code = 'NOMX';
    if (cb) return cb(err)
    throw err
}
