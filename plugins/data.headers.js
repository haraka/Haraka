// validate message headers and some fields
var net_utils = require('./net_utils');
var reject;

exports.register = function () {
    this.register_hook('data_post', 'duplicate_singular');
    this.register_hook('data_post', 'missing_required');
    this.register_hook('data_post', 'invalid_date');
    this.register_hook('data_post', 'invalid_return_path');
    this.register_hook('data_post', 'user_agent');
    this.register_hook('data_post', 'direct_to_mx');
    this.register_hook('data_post', 'from_match');
};

exports.hook_data = function(next, connection) {
    // refresh when a connection makes it to data
    this.cfg = this.config.get('data.headers.ini', {
        booleans: ['main.reject'],
    });

    if (this.cfg.main.reject !== undefined) {
        reject = this.cfg.main.reject;
    }

    return next();
}

exports.duplicate_singular = function(next, connection) {
    var plugin = this;

    // RFC 5322 Section 3.6, Headers that MUST be unique if present
    var singular = plugin.cfg.main.singular !== undefined ?
                   plugin.cfg.main.singular.split(',') :
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
        if (reject) {
            return next(DENY, "Only one " + failures[0] +
                " header allowed. See RFC 5322, Section 3.6");
        }
        return next();
    }

    connection.transaction.results.add(plugin, {pass: 'duplicate'});
    return next();
};

exports.missing_required = function(next, connection) {
    var plugin = this;

    // Enforce RFC 5322 Section 3.6, Headers that MUST be present
    var required = plugin.cfg.main.required !== undefined ?
                   plugin.cfg.main.required.split(',') :
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
        if (reject) {
            return next(DENY, "Required header '" + failures[0] + "' missing");
        }
        return next();
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
            if (reject) {
                return next(DENY, "outgoing mail must not have a Return-Path header (RFC 5321)");
            }
            return next();
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

    var msg_date = connection.transaction.header.get_all('Date');
    if (!msg_date || msg_date.length === 0) return next();

    connection.logdebug(plugin, "message date: " + msg_date);
    msg_date = Date.parse(msg_date);

    var date_future_days = plugin.cfg.main.date_future_days !== undefined ?
                           plugin.cfg.main.date_future_days :
                           2;

    if (date_future_days > 0) {
        var too_future = new Date;
        too_future.setHours(too_future.getHours() + 24 * date_future_days);
        // connection.logdebug(plugin, "too future: " + too_future);
        if (msg_date > too_future) {
            connection.transaction.results.add(plugin, {fail: 'invalid_date(future)'});
            if (reject) {
                return next(DENY, "The Date header is too far in the future");
            }
            return next();
        }
    }

    var date_past_days = plugin.cfg.main.date_past_days !== undefined ?
                         plugin.cfg.main.date_past_days :
                         15;

    if (date_past_days > 0) {
        var too_old = new Date;
        too_old.setHours(too_old.getHours() - 24 * date_past_days);
        // connection.logdebug(plugin, "too old: " + too_old);
        if (msg_date < too_old) {
            connection.loginfo(plugin, "date is older than: " + too_old);
            connection.transaction.results.add(plugin, {fail: 'invalid_date(past)'});
            if (reject) {
                return next(DENY, "The Date header is too old");
            }
            return next();
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
        connection.transaction.results.add(plugin, {pass: 'UA('+header.substring(0,12)+')'});
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

exports.from_match = function (next, connection) {
    var plugin = this;
    // see if the header From matches the envelope FROM. there are many legit
    // reasons to not match, but a match is much more hammy than spammy
    if (!connection) return next();
    if (!connection.transaction) return next();

    var env_from = connection.transaction.mail_from.address();
    var hdr_from = connection.transaction.header.get('From');
    if (!hdr_from) {
        connection.transaction.results.add(plugin, {fail: 'from_match(missing)'});
        return next();
    }

    // From: "Typical User" <user@example.com>
    var hdr_part = hdr_from.match(/<([\S]+)@([\S]+)>/);
    if (!hdr_part) {
        // From: staff@hotmail.com
        hdr_part = hdr_from.match(/[\s]*([\S]+)@([\S]+)[\s\r\n]*$/);
        if (!hdr_part) {
            connection.transaction.results.add(plugin, {fail: 'from_match(regex miss ('+hdr_from+'))'});
            return next();
        }
    }

    var msg_from = hdr_part[1] + '@' + hdr_part[2];

    if (env_from.toLowerCase() == msg_from.toLowerCase()) {
        connection.transaction.results.add(plugin, {pass: 'from_match'});
        return next();
    }

    var env_dom = net_utils.get_organizational_domain(connection.transaction.mail_from.host);
    var msg_dom = net_utils.get_organizational_domain(msg_from.replace(/^.*@/,''));
    if (env_dom.toLowerCase() == msg_dom.toLowerCase()) {
        connection.transaction.results.add(plugin, {pass: 'from_match(domain)'});
        return next();
    }
/*
    connection.logdebug(plugin, 'raw from: ' + connection.transaction.mail_from.address());
    connection.logdebug(plugin, 'header from: .' + hdr_from + '.');
    connection.logdebug(plugin, 'msg    from: .' + msg_from + '.');
*/
    connection.transaction.results.add(plugin, {emit: true,
        fail: 'from_match(' + env_dom + ' / ' + msg_dom + ')'
    });
    return next();
}
