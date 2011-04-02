// Check whether an email has any received headers or not, and reject if not

// NB: Don't check this on your outbounds. It's also a pretty strict check
//     for inbounds too, so use with caution.

exports.hook_data_post = function (callback, connection) {
    // We always have the received header that Haraka added, so check for 1
    if (connection.transaction.header.get_all('Received').length === 1) {
        callback(DENY, "Mails here must have a Received header");
    }
    else {
        callback(CONT);
    }
}