'use strict';
// Simple string signatures

exports.hook_data = (next, connection) => {
    // enable mail body parsing
    if (connection?.transaction) connection.transaction.parse_body = true;
    next();
}

exports.hook_data_post = function (next, connection) {
    if (!connection?.transaction) return next();

    const sigs = this.config.get('data.signatures', 'list');

    if (check_sigs(sigs, connection.transaction.body)) {
        return next(DENY, "Mail matches a known spam signature");
    }
    next();
}

function check_sigs (sigs, body) {
    for (let i=0,l=sigs.length; i < l; i++) {
        if (body.bodytext.includes(sigs[i])) return 1;
    }

    for (let i=0,l=body.children.length; i < l; i++) {
        if (check_sigs(sigs, body.children[i])) return 1;
    }
    return 0;
}
