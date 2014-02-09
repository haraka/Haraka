//queue/lmtp

"use strict";

var outbound = require('./outbound');

//get_mx hook
exports.hook_get_mx = function (next, hmail, domain) {
    //TODO: allow arrays of mx objects; currently only one mx object per domain
    var domains_ini = this.config.get('delivery_domains.ini', 'ini');
    if (domain in domains_ini) {
        next(OK, domains_ini[domain]);
    }
    else {
        next(CONT);
    }
}

exports.hook_queue = function (next, connection) {
    outbound.send_email(connection.transaction, next);
}
