// Enforce RFC 5322 Section 3.6 
exports.hook_data_post = function (next, connection) {
    var called_next = 0;

    // Headers that MUST be present
    ['Date', 'From'].forEach(function (h) {
        if (connection.transaction &&
            connection.transaction.header.get_all(h).length === 0) {
            called_next++; 
            return next(DENY, "Required header '" + h + "' missing");
        }
    });

    // Headers that MUST be unique if present
    ['Date', 'From', 'Sender', 'Reply-To', 'To', 'Cc', 'Bcc', 'Message-Id',
     'In-Reply-To', 'References', 'Subject'].forEach(function (h) {
        if (connection.transaction && 
            connection.transaction.header.get_all(h).length > 1) {
            called_next++;
            return next(DENY, "Message contains non-unique '" + h + "' header");
        }
    });

    if (!called_next) 
        return next();
}
