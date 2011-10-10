// discard

exports.register = function () {
    this.register_hook('queue','discard');
}

exports.discard = function (next, connection) {
    var transaction = connection.transaction;
    if (connection.notes.discard ||
        transaction.notes.discard) 
    {
        this.loginfo('discarding message');
        // Pretend we delivered the message
        return next(OK);
    }
    // Allow other queue plugins to deliver
    return next();
}
