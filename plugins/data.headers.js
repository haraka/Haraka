// validate message headers and some fields
var tlds = require('haraka-tld');

exports.register = function () {
    var plugin = this;

    plugin.load_headers_ini();

    try {
        plugin.addrparser = require('address-rfc2822');
    }
    catch (e) {
        plugin.logerror("unable to load address-rfc2822, try\n\n\t'npm install -g address-rfc2822'\n\n");
    }
    this.register_hook('data_post', 'duplicate_singular');
    this.register_hook('data_post', 'missing_required');
    this.register_hook('data_post', 'invalid_date');
    this.register_hook('data_post', 'invalid_return_path');
    this.register_hook('data_post', 'user_agent');
    this.register_hook('data_post', 'direct_to_mx');
    if (plugin.addrparser) {
        this.register_hook('data_post', 'from_match');
        this.register_hook('data_post', 'delivered_to');
    }
    this.register_hook('data_post', 'mailing_list');
};

exports.load_headers_ini = function () {
    var plugin = this;
    plugin.cfg = plugin.config.get('data.headers.ini', {
        booleans: [
            '+check.duplicate_singular',
            '+check.missing_required',
            '+check.invalid_return_path',
            '+check.invalid_date',
            '+check.user_agent',
            '+check.direct_to_mx',
            '+check.from_match',
            '+check.delivered_to',
            '+check.mailing_list',

            '-reject.duplicate_singular',
            '-reject.missing_required',
            '-reject.invalid_return_path',
            '-reject.invalid_date',
            '+reject.delivered_to',
        ],
    }, function () {
        plugin.load_headers_ini();
    });
};

exports.duplicate_singular = function(next, connection) {
    var plugin = this;
    if (!plugin.cfg.check.duplicate_singular) { return next(); }

    // RFC 5322 Section 3.6, Headers that MUST be unique if present
    var singular = plugin.cfg.main.singular !== undefined ?
                   plugin.cfg.main.singular.split(',') :
                   ['Date', 'From', 'Sender', 'Reply-To', 'To', 'Cc',
                    'Bcc', 'Message-Id', 'In-Reply-To', 'References',
                    'Subject'];

    var failures = [];
    for (var i=0; i < singular.length; i++ ) {
        if (connection.transaction.header.get_all(singular[i]).length <= 1) {
            continue;
        }

        var name = singular[i];
        connection.transaction.results.add(plugin, {fail: 'duplicate:'+name});
        failures.push(name);
    }

    if (failures.length) {
        if (plugin.cfg.reject.duplicate_singular) {
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
    if (!plugin.cfg.check.missing_required) { return next(); }

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
        if (plugin.cfg.reject.missing_required) {
            return next(DENY, "Required header '" + failures[0] + "' missing");
        }
        return next();
    }

    connection.transaction.results.add(plugin, {pass: 'missing'});
    return next();
};

exports.invalid_return_path = function(next, connection) {
    var plugin = this;
    if (!plugin.cfg.check.invalid_return_path) { return next(); }

    // Tests for Return-Path headers that shouldn't be present

    // RFC 5321#section-4.4 Trace Information
    //   A message-originating SMTP system SHOULD NOT send a message that
    //   already contains a Return-path header field.

    // Return-Path, aka Reverse-PATH, Envelope FROM, RFC5321.MailFrom
    var rp = connection.transaction.header.get('Return-Path');
    if (rp) {
        if (connection.relaying) {      // On messages we originate
            connection.transaction.results.add(plugin, {fail: 'Return-Path', emit: true});
            if (plugin.cfg.reject.invalid_return_path) {
                return next(DENY, "outgoing mail must not have a Return-Path header (RFC 5321)");
            }
            return next();
        }

        // generally, messages from the internet shouldn't have a
        // Return-Path, except for when they can. Read RFC 5321, it's
        // complicated. In most cases, The Right Thing to do here is to
        // strip the Return-Path header.
        connection.transaction.remove_header('Return-Path');
        // unless it was added by Haraka. Which at present, doesn't.
    }

    connection.transaction.results.add(plugin, {pass: 'Return-Path'});
    return next();
};

exports.invalid_date = function (next, connection) {
    var plugin = this;
    if (!plugin.cfg.check.invalid_date) { return next(); }

    // Assure Date header value is [somewhat] sane

    var msg_date = connection.transaction.header.get_all('Date');
    if (!msg_date || msg_date.length === 0) { return next(); }

    connection.logdebug(plugin, "message date: " + msg_date);
    msg_date = Date.parse(msg_date);

    var date_future_days = plugin.cfg.main.date_future_days !== undefined ?
                           plugin.cfg.main.date_future_days :
                           2;

    if (date_future_days > 0) {
        var too_future = new Date();
        too_future.setHours(too_future.getHours() + 24 * date_future_days);
        // connection.logdebug(plugin, "too future: " + too_future);
        if (msg_date > too_future) {
            connection.transaction.results.add(plugin, {fail: 'invalid_date(future)'});
            if (plugin.cfg.reject.invalid_date) {
                return next(DENY, "The Date header is too far in the future");
            }
            return next();
        }
    }

    var date_past_days = plugin.cfg.main.date_past_days !== undefined ?
                         plugin.cfg.main.date_past_days :
                         15;

    if (date_past_days > 0) {
        var too_old = new Date();
        too_old.setHours(too_old.getHours() - 24 * date_past_days);
        // connection.logdebug(plugin, "too old: " + too_old);
        if (msg_date < too_old) {
            connection.loginfo(plugin, "date is older than: " + too_old);
            connection.transaction.results.add(plugin, {fail: 'invalid_date(past)'});
            if (plugin.cfg.reject.invalid_date) {
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
    if (!plugin.cfg.check.user_agent) { return next(); }

    if (!connection.transaction) { return next(); }

    var found_ua = 0;

    // User-Agent: Thunderbird, Squirrelmail, Roundcube, Mutt, MacOutlook,
    //             Kmail, IMP
    // X-Mailer: Apple Mail, swaks, Outlook (12-14), Yahoo Webmail,
    //           Cold Fusion, Zimbra, Evolution
    // X-Yahoo-Newman-Property: Yahoo
    // X-MS-Has-Attach: Outlook 15

    // Check for User-Agent
    var headers = [
        'user-agent','x-mailer','x-mua','x-yahoo-newman-property',
        'x-ms-has-attach'
    ];
    for (var i=0; i < headers.length; i++) {
        var name = headers[i];
        var header = connection.transaction.header.get(name);
        if (!header) { continue; }   // header not present
        found_ua++;
        connection.transaction.results.add(plugin,
            {pass: 'UA('+header.substring(0,12)+')'});
    }
    if (found_ua) { return next(); }

    connection.transaction.results.add(plugin, {fail: 'UA'});
    return next();
};

exports.direct_to_mx = function (next, connection) {
    var plugin = this;
    if (!plugin.cfg.check.direct_to_mx) { return next(); }

    if (!connection.transaction) { return next(); }

    // Legit messages normally have at least 2 hops (Received headers)
    //     MUA -> sending MTA -> Receiving MTA (Haraka?)
    if (connection.notes.auth_user) {
        // User authenticated, so we're likely the first MTA
        connection.transaction.results.add(plugin, {skip: 'direct-to-mx(auth)'});
        return next();
    }

    // what about connection.relaying?

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
    if (!plugin.cfg.check.from_match) { return next(); }

    // see if the header From matches the envelope FROM. There are valid
    // cases to not match (~10% of ham) but a non-match is much more
    // likely to be spam than ham. This test is useful for heuristics.
    if (!connection.transaction) { return next(); }

    var env_addr = connection.transaction.mail_from;
    if (!env_addr) {
        connection.transaction.results.add(plugin, {fail: 'from_match(null)'});
        return next();
    }

    var hdr_from = connection.transaction.header.get('From');
    if (!hdr_from) {
        connection.transaction.results.add(plugin, {fail: 'from_match(missing)'});
        return next();
    }

    var hdr_addr = (plugin.addrparser.parse(hdr_from))[0];
    if (!hdr_addr) {
        connection.transaction.results.add(plugin, {fail: 'from_match(unparsable)'});
        return next();
    }

    if (env_addr.address().toLowerCase() === hdr_addr.address.toLowerCase()) {
        connection.transaction.results.add(plugin, {pass: 'from_match'});
        return next();
    }

    var extra = ['domain'];
    var env_dom = tlds.get_organizational_domain(env_addr.host);
    var msg_dom = tlds.get_organizational_domain(hdr_addr.host());
    if (env_dom && msg_dom && env_dom.toLowerCase() === msg_dom.toLowerCase()) {
        var fcrdns  = connection.results.get('connect.fcrdns');
        if (fcrdns && fcrdns.fcrdns && new RegExp(msg_dom + '\\b', 'i').test(fcrdns.fcrdns)) {
            extra.push('fcrdns');
        }
        var helo = connection.results.get('helo.checks');
        if (helo && helo.helo_host && /msg_dom$/.test(helo.helo_host)) {
            extra.push('helo');
        }

        connection.transaction.results.add(plugin, {pass: 'from_match('+extra.join(',')+')'});
        return next();
    }

    connection.transaction.results.add(plugin, {emit: true,
        fail: 'from_match(' + env_dom + ' / ' + msg_dom + ')'
    });
    return next();
};

exports.delivered_to = function (next, connection) {
    var plugin = this;
    if (!plugin.cfg.check.delivered_to) { return next(); }

    var txn = connection.transaction;
    if (!txn) return next();
    var del_to = txn.header.get('Delivered-To');
    if (!del_to) return next();

    var rcpts = connection.transaction.rcpt_to;
    for (var i=0; i<rcpts.length; i++) {
        var rcpt = rcpts[i].address();
        if (rcpt !== del_to) continue;
        connection.transaction.results.add(plugin, {emit: true, fail: 'delivered_to'});
        if (!plugin.cfg.reject.delivered_to) continue;
        return next(DENY, "Invalid Delivered-To header content");
    }

    return next();
};

exports.mailing_list = function (next, connection) {
    var plugin = this;
    if (!plugin.cfg.check.mailing_list) { return next(); }
    if (!connection.transaction) { return next(); }

    var mlms = {
        'Mailing-List'       : [
            { mlm: 'ezmlm',       match: 'ezmlm' },
            { mlm: 'yahoogroups', match: 'yahoogroups' },
        ],
        'Sender'             : [
            { mlm: 'majordomo',   start: 'owner-' },
        ],
        'X-Mailman-Version'  : [ { mlm: 'mailman'   }, ],
        'X-Majordomo-Version': [ { mlm: 'majordomo' }, ],
        'X-Google-Loop'      : [ { mlm: 'googlegroups' } ],
    };

    var found_mlm = 0;
    var txr = connection.transaction.results;

    Object.keys(mlms).forEach(function (name) {
        var header = connection.transaction.header.get(name);
        if (!header) { return; }  // header not present
        for (var i=0; i < mlms[name].length; i++) {
            var j = mlms[name][i];
            if (j.start) {
                if (header.substring(0,j.start.length) === j.start) {
                    txr.add(plugin, {pass: 'MLM('+j.mlm+')'});
                    found_mlm++;
                    continue;
                }
                // NOTE: Unlike the next "j.match" code block, this condition alone
                //       (Sender header != "owner-...") should not log an error
                connection.logdebug(plugin, "mlm start miss: " + name + ': ' + header);
            }
            if (j.match) {
                if (header.match(new RegExp(j.match,'i'))) {
                    txr.add(plugin, {pass: 'MLM('+j.mlm+')'});
                    found_mlm++;
                    continue;
                }
                connection.logerror(plugin, "mlm match miss: " + name + ': ' + header);
            }
            if (name === 'X-Mailman-Version') {
                txr.add(plugin, {pass: 'MLM('+j.mlm+')'});
                found_mlm++;
                continue;
            }
            if (name === 'X-Majordomo-Version') {
                txr.add(plugin, {pass: 'MLM('+j.mlm+')'});
                found_mlm++;
                continue;
            }
            if (name === 'X-Google-Loop') {
                txr.add(plugin, {pass: 'MLM('+j.mlm+')'});
                found_mlm++;
                continue;
            }
        }
    });
    if (found_mlm) { return next(); }

    connection.transaction.results.add(plugin, {msg: 'not MLM'});
    return next();
};
