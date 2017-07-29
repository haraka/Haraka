"use strict";

var dns         = require('dns');

exports.lookup_mx = function lookup_mx (domain, cb) {
    var mxs = [];

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

    // default wrap_mx just returns our object with "priority" and "exchange" keys
    var wrap_mx = function (a) { return a; };
    var process_dns = function (err, addresses) {
        if (err) {
            if (err.code === 'ENODATA') {
                // Most likely this is a hostname with no MX record
                // Drop through and we'll get the A record instead.
                return 0;
            }
            cb(err);
        }
        else if (addresses && addresses.length) {
            for (var i=0,l=addresses.length; i < l; i++) {
                var mx = wrap_mx(addresses[i]);
                mxs.push(mx);
            }
            cb(null, mxs);
        }
        else {
            // return zero if we need to keep trying next option
            return 0;
        }
        return 1;
    };

    dns.resolveMx(domain, function (err, addresses) {
        if (process_dns(err, addresses)) {
            return;
        }

        // if MX lookup failed, we lookup an A record. To do that we change
        // wrap_mx() to return same thing as resolveMx() does.
        wrap_mx = function (a) { return {priority:0,exchange:a}; };
        // IS: IPv6 compatible
        dns.resolve(domain, function (err2, addresses2) {
            if (process_dns(err2, addresses2)) {
                return;
            }
            err2 = new Error("Found nowhere to deliver to");
            err2.code = 'NOMX';
            cb(err2);
        });
    });
};
