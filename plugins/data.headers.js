
// Enforce RFC 5322 Section 3.6
var required_headers = ['Date', 'From'];
var singular_headers = ['Date', 'From', 'Sender', 'Reply-To', 'To', 'Cc',
                         'Bcc', 'Message-Id', 'In-Reply-To', 'References',
                         'Subject'];
var date_future_days = 2;
var date_past_days   = 15;

exports.hook_data_post = function (next, connection) {
    var plugin = this;
    refreshConfig(plugin);

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
    };

    var errmsg = checkDateValid(plugin,connection);
    if (errmsg) return next(DENY, errmsg);

    return next();
}

function checkDateValid (plugin,connection) {

    var msg_date = connection.transaction.header.get_all('Date');
    if (!msg_date || msg_date.length === 0) return;

    connection.logdebug(plugin, "message date: " + msg_date);
    msg_date = Date.parse(msg_date);

    if (date_future_days > 0) {
        var too_future = new Date;
        too_future.setHours(too_future.getHours() + 24 * date_future_days);
        // connection.logdebug(plugin, "too future: " + too_future);
        if (msg_date > too_future) {
            connection.loginfo(plugin, "date is newer than: " + too_future );
            return "The Date header is too far in the future";
        };
    }
    if (date_past_days > 0) {
        var too_old = new Date;
        too_old.setHours(too_old.getHours() - 24 * date_past_days);
        // connection.logdebug(plugin, "too old: " + too_old);
        if (msg_date < too_old) {
            connection.loginfo(plugin, "date is older than: " + too_old);
            return "The Date header is too old";
        };
    };
    return;
};

function refreshConfig(plugin) {
    var config = plugin.config.get('data.headers.ini');

    if (config.main.required !== 'undefined') {
        required_headers = config.main.required.split(',');
    };
    if (config.main.singular !== 'undefined') {
        singular_headers = config.main.singular.split(',');
    };

    if (config.main.date_future_days !== 'undefined') {
        date_future_days = config.main.date_future_days;
    }
    if (config.main.date_past_days !== 'undefined') {
        date_past_days = config.main.date_past_days;
    }
}

