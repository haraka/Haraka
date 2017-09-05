// discard

exports.register = function () {
    this.register_hook('queue', 'discard');
    this.register_hook('queue_outbound', 'discard');
}

exports.discard = function (next, connection) {
    const txn = connection.transaction;
    if (txn.notes.queue && txn.notes.queue !== 'discard') return next();

    function discard () {
        connection.loginfo(this, 'discarding message');
        // Pretend we delivered the message
        return next(OK);
    }

    if (connection.notes.discard)          return discard();
    if (txn.notes.discard)                 return discard();
    if (txn.notes.queue === 'discard')     return discard();
    if (process.env.YES_REALLY_DO_DISCARD) return discard();

    // Allow other queue plugins to deliver
    return next();
}
