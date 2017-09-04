// discard

exports.register = function () {
    this.register_hook('queue', 'discard');
    this.register_hook('queue_outbound', 'discard');
}

exports.discard = function (next, connection) {
    var transaction = connection.transaction;

    if (transaction.queue.wants) {
        if (transaction.queue.wants === 'discard') return next(OK);
        return next();
    }

    if (connection.notes.discard || transaction.notes.discard) {
        connection.loginfo(this, 'discarding message');
        // Pretend we delivered the message
        return next(OK);
    }

    if (process.env.YES_REALLY_DO_DISCARD) {
        return next(OK);
    }

    // Allow other queue plugins to deliver
    return next();
}
