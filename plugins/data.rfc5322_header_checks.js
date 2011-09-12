// Enforce RFC 5322 Section 3.6 
exports.hook_data_post = function (next, connection) {
    // Headers that MUST be present
    return ['Date', 'From'].forEach(function (h) {
        if (connection.transaction &&
            connection.transaction.header.get_all(h).length === 0) {
            return next(DENY, "Required header '" + h + "' missing");
        }
    });

    // Headers that MUST be unique if present
    return ['Date', 'From', 'Sender', 'Reply-To', 'To', 'Cc', 'Bcc', 
    'Message-Id', 'In-Reply-To', 'References', 'Subject'].forEach(function (h) {
        if (connection.transaction && 
            connection.transaction.header.get_all(h).length > 1) {
            return next(DENY, "Message contains non-unique '" + h + "' header");
        }
    });

    return next();
}
