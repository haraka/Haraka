// This plugin is entirely redundant. The core will queue outbound mails
// automatically just like this. It is kept here for backwards compatibility
// purposes only.

const outbound = require('./outbound');

exports.hook_queue_outbound = (next, connection) => {
    // if not relaying, don't deliver outbound
    if (!connection?.relaying) return next();

    outbound.send_trans_email(connection?.transaction, next);
}
