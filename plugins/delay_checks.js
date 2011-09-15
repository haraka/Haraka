exports.hook_deny = function (next, connection, params) {
    var transaction = connection.transaction;
    // Don't delay ourselves...
    if (params[2] == 'delay_checks') {
        return next();
    }
    switch(params[5]) {
        // Pre-DATA connection delays
        case 'connect':
        case 'ehlo':
        case 'helo':
            if (!connection.notes.delay_checks_pre) {
                connection.notes.delay_checks_pre = [];
            }
            connection.notes.delay_checks_pre.push(params);
            return next(OK);
            break;
        // Pre-DATA transaction delays
        case 'mail':
        case 'rcpt':
            if (!transaction.notes.delay_checks_pre) {
                transaction.notes.delay_checks_pre = [];
            }
            transaction.notes.delay_checks_pre.push(params);
            return next(OK);
            break;
        // Post DATA delays
        case 'data':
        case 'data_post':
            if (!transaction.notes.delay_check_post) {
                transaction.nodes.delay_check_post = [];
            }
            transaction.notes.delay_checks_post.push(params);
            return next(OK);
            break;
        default:
            // No delays
            return next();
    }
}

exports.hook_rcpt_ok = function (next, connection) {
    var transaction = connection.transaction;

    // Check connection level pre-DATA rejections first
    if (connection.notes.delay_checks_pre &&
        connection.notes.delay_checks_pre.length > 0)
    {
        var params = connection.notes.delay_checks_pre.shift();
        return next(params[0], params[1]);
    }
    // Then check transaction level pre-DATA
    if (transaction.notes.delay_checks_pre && 
        transaction.notes.delay_checks_pre.length > 0) 
    {
        var params = transaction.notes.delay_checks_pre.shift();
        return next(params[0], params[1]);
    }
    return next();
}


exports.hook_data_post = function (next, connection) {
    var transaction = connection.transaction;
    var delay_checks_post = transaction.notes.delay_checks_post;
    if (delay_checks_post && delay_checks_post.length > 0) {
        var params = delay_checks_post.shift();
        return next(params[0], params[1]);
    }
    return next();
}
