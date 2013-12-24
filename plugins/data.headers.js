
// Enforce RFC 5322 Section 3.6
var required_headers = ['Date', 'From'];
var singular_headers = ['Date', 'From', 'Sender', 'Reply-To', 'To', 'Cc',
                         'Bcc', 'Message-Id', 'In-Reply-To', 'References',
                         'Subject'];
var date_future_days = 2;
var date_past_days   = 15;

exports.register = function() {
    var config   = this.config.get('data.headers.ini');

    if ( config.main.required ) {
        required_headers = config.main.required.split(',');
    };
    if ( config.main.singular ) {
        singular_headers = config.main.singular.split(',');
    };

    if ( config.main.date_future_days ) {
        date_future_days = config.main.date_future_days;
    }
    if ( config.main.date_past_days ) {
        date_past_days = config.main.date_past_days;
    }
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
             return next(DENY, "Only one " + singular_headers[i] +
                " header allowed. See RFC 5322, Section 3.6");
        }
    }

    return next();
}
