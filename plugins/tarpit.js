// tarpit

exports.register = function () {
    // Register tarpit function last
    var self = this;
    ['connect', 'helo', 'ehlo', 'mail', 'rcpt', 'rcpt_ok', 'data',
     'data_post', 'queue', 'unrecognized_command', 'vrfy', 'noop', 
     'rset', 'quit'].forEach(function (hook) {
        self.register_hook(hook, 'tarpit');
    });
}

exports.tarpit = function (next, connection) {
    var transaction = connection.transaction;
    var conn_delay, trans_delay;
    if (transaction && transaction.notes) {
        trans_delay = transaction.notes.tarpit;
    }
    if (connection && connection.notes) {
        conn_delay = connection.notes.tarpit;
    }
    var delay = trans_delay || conn_delay;
    if (delay) {
        connection.loginfo(this, 'tarpitting response for ' + delay + 's');
        setTimeout(function () {
            // Only return if we still have a connection...
            if (connection) return next();
        }, (delay*1000));
    }
    else {
        return next();
    }
}
