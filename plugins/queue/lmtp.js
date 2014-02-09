//queue/lmtp

"use strict";

var outbound = require('./outbound');

exports.hook_get_mx = function (next, hmail, domain) {
    if (!hmail.todo.notes.using_lmtp) return next();
    var config = this.config.get('lmtp.ini', 'ini');
    var section = config[domain] || config.main;
    var mx = {
        priority: 0,
        exchange: section.host || '127.0.0.1',
        port: section.port || 24,
        using_lmtp: true
    };
    return next(OK, mx);
}

exports.hook_queue = function (next, connection) {
    connection.transaction.notes.using_lmtp = true;
    outbound.send_email(connection.transaction, next);
}
