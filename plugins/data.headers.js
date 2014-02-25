// validate message headers and some fields

exports.register = function () {
    this.register_hook('data_post', 'duplicate_singular');
    this.register_hook('data_post', 'missing_required');
    this.register_hook('data_post', 'invalid_date');
    this.register_hook('data_post', 'invalid_return_path');
    this.register_hook('data_post', 'user_agent');
    this.register_hook('data_post', 'direct_to_mx');
};

exports.duplicate_singular = function(next, connection) {
    var plugin = this;
    var config = plugin.config.get('data.headers.ini');

    // RFC 5322 Section 3.6, Headers that MUST be unique if present
    var singular = config.main.singular !== 'undefined' ?
                   config.main.singular.split(',') :
                   ['Date', 'From', 'Sender', 'Reply-To', 'To', 'Cc',
                    'Bcc', 'Message-Id', 'In-Reply-To', 'References',
                    'Subject'];

    var failures = [];
    for (var i=0, l=singular.length; i < l; i++) {
        if (connection.transaction.header.get_all(singular[i]).length > 1) {
            var name = singular[i];
            connection.transaction.results.add(plugin, {fail: 'duplicate:'+name});
            failures.push(name);
        }
    }

    if (failures.length) {
        return next(DENY, "Only one " + failures[0] +
            " header allowed. See RFC 5322, Section 3.6");
    }

    connection.transaction.results.add(plugin, {pass: 'duplicate'});
    return next();
};

exports.missing_required = function(next, connection) {
    var plugin = this;
    var config = plugin.config.get('data.headers.ini');

    // Enforce RFC 5322 Section 3.6, Headers that MUST be present
    var required = config.main.required !== 'undefined' ?
                   config.main.required.split(',') :
                   ['Date', 'From'];

    var failures = [];
    for (var i=0; i < required.length; i++) {
        var h = required[i];
        if (connection.transaction.header.get_all(h).length === 0) {
            connection.transaction.results.add(plugin, {fail: 'missing:'+h});
            failures.push(h);
        }
    }
    if (failures.length) {
        return next(DENY, "Required header '" + failures[0] + "' missing");
    }

    connection.transaction.results.add(plugin, {pass: 'missing'});
    return next();
};

exports.invalid_return_path = function(next, connection) {
    // This tests for headers that shouldn't be present

    // RFC 5321#section-4.4 Trace Information
    //   A message-originating SMTP system SHOULD NOT send a message that
    //   already contains a Return-path header field.

    // Return-Path, aka Reverse-PATH, Envelope FROM, RFC5321.MailFrom
    var rp = connection.transaction.header.get('Return-Path');
    var plugin = this;
    if (rp) {
        if (connection.relaying) {      // On messages we originate
            connection.transaction.results.add(plugin, {fail: 'Return-Path', emit: true});
            return next(DENY, "outgoing mail must not have a Return-Path header (RFC 5321)");
        }
        else {
            // generally, messages from the internet shouldn't have a
            // Return-Path, except for when they can. Read RFC 5321, it's
            // complicated. In most cases, The Right Thing to do here is to
            // strip the Return-Path header.
            connection.transaction.remove_header('Return-Path');
            // unless it was added by Haraka. Which at present, doesn't.
        }
    }

    connection.transaction.results.add(plugin, {pass: 'Return-Path'});
    return next();
};

exports.invalid_date = function (next, connection) {
    var plugin = this;
    // Assure Date header value is [somewhat] sane

    var config = plugin.config.get('data.headers.ini');
    var msg_date = connection.transaction.header.get_all('Date');
    if (!msg_date || msg_date.length === 0) return next();

    connection.logdebug(plugin, "message date: " + msg_date);
    msg_date = Date.parse(msg_date);

    var date_future_days = config.main.date_future_days !== 'undefined' ?
                           config.main.date_future_days :
                           2;

    if (date_future_days > 0) {
        var too_future = new Date;
        too_future.setHours(too_future.getHours() + 24 * date_future_days);
        // connection.logdebug(plugin, "too future: " + too_future);
        if (msg_date > too_future) {
            connection.transaction.results.add(plugin, {fail: 'invalid_date(future)'});
            return next(DENY, "The Date header is too far in the future");
        }
    }

    var date_past_days = config.main.date_past_days !== 'undefined' ?
                         config.main.date_past_days :
                         15;

    if (date_past_days > 0) {
        var too_old = new Date;
        too_old.setHours(too_old.getHours() - 24 * date_past_days);
        // connection.logdebug(plugin, "too old: " + too_old);
        if (msg_date < too_old) {
            connection.loginfo(plugin, "date is older than: " + too_old);
            connection.transaction.results.add(plugin, {fail: 'invalid_date(past)'});
            return next(DENY, "The Date header is too old");
        }
    }

    connection.transaction.results.add(plugin, {pass: 'invalid_date'});
    return next();
};

exports.user_agent = function (next, connection) {
    var plugin = this;
    if (!connection) return next();
    if (!connection.transaction) return next();
    var h = connection.transaction.header;

    var found_ua = 0;

    // User-Agent: Thunderbird, Squirrelmail, Roundcube, Mutt, MacOutlook, Kmail, IMP
    // X-Mailer: Apple Mail, swaks, Outlook (12-14), Yahoo Webmail, Cold Fusion, Zimbra, Evolution

    // Check for User-Agent
    var headers = ['user-agent','x-mailer','x-mua'];
    for (var i=0; i < headers.length; i++) {
        var name = headers[i];
        var header = connection.transaction.header.get(name);
        if (!header) continue;   // header not present
        found_ua++;
        connection.transaction.results.add(plugin, {pass: 'UA('+header+')'});
    }
    if (found_ua) return next();

    connection.transaction.results.add(plugin, {fail: 'UA'});
    return next();
};

exports.direct_to_mx = function (next, connection) {
    var plugin = this;
    if (!connection) return next();
    if (!connection.transaction) return next();

    // Legit messages normally have at least 2 hops (Received headers)
    //     MUA -> sending MTA -> Receiving MTA (Haraka?)
    if (connection.notes.auth_user) {
        // User authenticated, so we're likely the first MTA
        connection.transaction.results.add(plugin, {skip: 'direct-to-mx(auth)'});
        return next();
    }

    // TODO: what about connection.relaying? (...collecting data...)

    var received = connection.transaction.header.get_all('received');
    if (!received) {
        connection.transaction.results.add(plugin, {fail: 'direct-to-mx(none)'});
        return next();
    }

    var c = received.length;
    if (c < 2) {
        connection.transaction.results.add(plugin, {fail: 'direct-to-mx(too few Received('+c+'))'});
        return next();
    }

    connection.transaction.results.add(plugin, {pass: 'direct-to-mx('+c+')'});
    return next();
};
