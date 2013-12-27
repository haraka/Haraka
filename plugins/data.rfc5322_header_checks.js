// Enforce RFC 5322 Section 3.6
var required_headers = ['Date', 'From'];
var singular_headers =  ['Date', 'From', 'Sender', 'Reply-To', 'To', 'Cc',
                         'Bcc', 'Message-Id', 'In-Reply-To', 'References',
                         'Subject'];

exports.register = function () {
    this.logwarn("NOTICE: plugin deprecated, use 'data.headers' instead!");
}

exports.hook_data_post = function (next, connection) {
    var header = connection.transaction.header;
    // Headers that MUST be present
    for (var i=0,l=required_headers.length; i < l; i++) {
        if (header.get_all(required_headers[i]).length === 0)
        {
            return next(DENY, "Required header '" + required_headers[i] +
                                "' missing");
        }
    }

    // Headers that MUST be unique if present
    for (var i=0,l=singular_headers.length; i < l; i++) {
        if (header.get_all(singular_headers[i]).length > 1) {
             return next(DENY, "Message contains non-unique '" +
                                singular_headers[i] + "' header");
        }
    }

    return next();
}
