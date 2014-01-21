// validate message headers and some fields

exports.hook_data_post = function (next, connection) {
    var plugin = this;
    var config = plugin.config.get('data.headers.ini');

    var errmsg = has_missing_header(plugin, connection, config);
    if (errmsg) return next(DENY, errmsg);

    errmsg = has_duplicate_singular(plugin, connection, config);
    if (errmsg) return next(DENY, errmsg);

    errmsg = has_invalid_date(plugin, connection, config);
    if (errmsg) return next(DENY, errmsg);

    errmsg = has_invalid_header(plugin, connection);
    if (errmsg) return next(DENY, errmsg);

    return next();
}

function has_duplicate_singular(plugin, connection, config) {

    // RFC 5322 Section 3.6, Headers that MUST be unique if present
    var singular = config.main.singular !== 'undefined'
                 ? config.main.singular.split(',')
                 : ['Date', 'From', 'Sender', 'Reply-To', 'To', 'Cc',
                    'Bcc', 'Message-Id', 'In-Reply-To', 'References',
                    'Subject'];

    for (var i=0, l=singular.length; i < l; i++) {
        if (connection.transaction.header.get_all(singular[i]).length > 1) {
             return "Only one " + singular[i] + " header allowed. See RFC 5322, Section 3.6";
        }
    };
    return;
};

function has_missing_header(plugin, connection, config) {

    // Enforce RFC 5322 Section 3.6, Headers that MUST be present
    var required = config.main.required !== 'undefined'
                 ? config.main.required.split(',')
                 : ['Date', 'From'];

    for (var i=0, l=required.length; i < l; i++) {
        if (connection.transaction.header.get_all(required[i]).length === 0) {
            return "Required header '" + required[i] + "' missing";
        }
    }
    return;
};

function has_invalid_header(plugin, connection) {
    // This tests for headers that shouldn't be present

    // RFC 5321#section-4.4 Trace Information
    //   A message-originating SMTP system SHOULD NOT send a message that
    //   already contains a Return-path header field.

    // Return-Path, aka Reverse-PATH, Envelope FROM, RFC5321.MailFrom
    if (connection.relaying) {      // On messages we originate
        var rp = connection.transaction.header.get('Return-Path');
        if (rp) {
            connection.loginfo(plugin, "invalid Return-Path!");
            return "outgoing mail must not have a Return-Path header (RFC 5321)";
        };
    };

    // other tests here...
    return;
};

function has_invalid_date (plugin, connection, config) {
    // Assure Date header value is [somewhat] sane

    var msg_date = connection.transaction.header.get_all('Date');
    if (!msg_date || msg_date.length === 0) return;

    connection.logdebug(plugin, "message date: " + msg_date);
    msg_date = Date.parse(msg_date);

    var date_future_days = config.main.date_future_days !== 'undefined'
                         ? config.main.date_future_days
                         : 2;

    if (date_future_days > 0) {
        var too_future = new Date;
        too_future.setHours(too_future.getHours() + 24 * date_future_days);
        // connection.logdebug(plugin, "too future: " + too_future);
        if (msg_date > too_future) {
            connection.loginfo(plugin, "date is newer than: " + too_future );
            return "The Date header is too far in the future";
        };
    }

    var date_past_days   = config.main.date_past_days !== 'undefined'
                         ? config.main.date_past_days
                         : 15;

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
