// queue/lmtp
var outbound = require('./outbound');

exports.hook_get_mx = function (next, hmail, domain) {
    var ok_domains = hmail.todo.notes.ok_domains;
    // Only route 'inbound' domains to LMTP
    if (ok_domains && ok_domains[domain.toLowerCase()]) {
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
    return next();
}

exports.hook_queue = function (next, connection) {
    outbound.send_email(connection.transaction, next);
}
