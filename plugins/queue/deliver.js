var outbound = require('./outbound');

exports.hook_queue = function (next, connection) {
    if (!connection.relaying) {
        return next(); // we're not relaying so don't deliver outbound
    }
    
    outbound.send_email(connection.transaction, next);
}
