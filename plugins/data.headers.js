
// Enforce RFC 5322 Section 3.6
var required_headers = ['Date', 'From'];
var singular_headers = ['Date', 'From', 'Sender', 'Reply-To', 'To', 'Cc',
                         'Bcc', 'Message-Id', 'In-Reply-To', 'References',
                         'Subject'];
var date_future_days = 2;
var date_past_days   = 15;

exports.hook_data_post = function (next, connection) {
    refreshConfig(this);

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

    var msg_date = header.get_all('Date');
    if ( msg_date.length > 0 ) {
        this.logdebug(connection, "message date: " + msg_date);
        var msg_secs = Date.parse(msg_date);
        this.logdebug(connection, "parsed date: " + msg_secs);
        var now_secs = Date.now();
        this.logdebug(connection, "now seconds: " + now_secs);
        
        if ( date_future_days > 0 && msg_secs > (now_secs + (date_future_days * 24 * 3600)) ) {
            this.loginfo(connection, "date too far in the future: " + msg_date );
            return next(DENY, "The Date header is too far in the future");
        }
        if ( date_past_days > 0 && msg_secs < (now_secs - ( date_past_days * 24 * 3600 )) ) {
            this.loginfo(connection, "date too old: " + msg_date );
            return next(DENY, "The Date header is too old");
        };
    };

    return next();
}

function refreshConfig(plugin) {
    var config   = plugin.config.get('data.headers.ini');

    if ( config.main.required !== 'undefined' ) {
        required_headers = config.main.required.split(',');
    };
    if ( config.main.singular !== 'undefined' ) {
        singular_headers = config.main.singular.split(',');
    };

    if ( config.main.date_future_days !== 'undefined' ) {
        date_future_days = config.main.date_future_days;
    }
    if ( config.main.date_past_days !== 'undefined' ) {
        date_past_days = config.main.date_past_days;
    }
}

