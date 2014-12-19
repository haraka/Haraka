// bounce tests

var net_utils = require('./net_utils');

exports.register = function () {
    var plugin = this;
    plugin.load_bounce_ini();
    plugin.load_bounce_bad_rcpt();

    plugin.register_hook('mail',      'reject_all');
    plugin.register_hook('data',      'single_recipient');
    plugin.register_hook('data',      'bad_rcpt');
    plugin.register_hook('data_post', 'empty_return_path');
    plugin.register_hook('data_post', 'non_local_msgid');
};

exports.load_bounce_bad_rcpt = function () {
    var plugin = this;

    var new_list = plugin.config.get('bounce_bad_rcpt', 'list', function () {
        load_bounce_bad_rcpt();
    });

    var invalids = {};
    for (var i=0; i < new_list.length; i++) {
        invalids[new_list[i]] = true;
    }
    
    plugin.cfg.invalid_addrs = invalids;
};

exports.load_bounce_ini = function () {
    var plugin = this;
    plugin.cfg = plugin.config.get('bounce.ini', {
        booleans: [
            '-check.reject_all',
            '+check.single_recipient',
            '-check.empty_return_path',
            '+check.bad_rcpt',
            '-check.non_local_msgid',

            '+reject.single_recipient',
            '-reject.empty_return_path',
        ],
    }, function () {
        plugin.load_bounce_ini();
    });

    // Legacy config handling
    if (plugin.cfg.main.reject_invalid) {
        plugin.logerror("bounce.ini is out of date, please update!");
        plugin.cfg.check.single_recipient=true;
        plugin.cfg.reject.single_recipient=true;
    }

    if (plugin.cfg.main.reject_all) {
        plugin.logerror("bounce.ini is out of date, please update!");
        plugin.cfg.check.reject_all=true;
    }
};

exports.reject_all = function (next, connection, params) {
    var plugin = this;
    if (!plugin.cfg.check.reject_all) { return next(); }

    var mail_from = params[0];

    if (!plugin.has_null_sender(connection, mail_from)) {
        return next(); // bounce messages are from null senders
    }

    connection.transaction.results.add(plugin, {fail: 'bounces_accepted', emit: true });
    return next(DENY, "No bounces accepted here");
};

exports.single_recipient = function(next, connection) {
    var plugin = this;
    if (!plugin.cfg.check.single_recipient) return next();
    if (!plugin.has_null_sender(connection)) return next();

    var transaction = connection.transaction;

    // Valid bounces have a single recipient
    if (connection.transaction.rcpt_to.length === 1) {
        transaction.results.add(plugin, {pass: 'single_recipient', emit: true });
        return next();
    }

    connection.loginfo(plugin, "bounce with too many recipients to: " +
        connection.transaction.rcpt_to.join(','));

    transaction.results.add(plugin, {fail: 'single_recipient', emit: true });

    if (!plugin.cfg.reject.single_recipient) return next();

    return next(DENY, "this bounce message does not have 1 recipient");
};

exports.empty_return_path = function(next, connection) {
    var plugin = this;
    if (!plugin.cfg.check.empty_return_path) return next();
    if (!plugin.has_null_sender(connection)) return next();

    var transaction = connection.transaction;

    // Bounce messages generally do not have a Return-Path set. This checks
    // for that. But whether it should is worth questioning...

    // On Jan 20, 2014, Matt Simerson examined the most recent 50,000 mail
    // connections for the presence of Return-Path in bounce messages. I
    // found 14 hits, 12 of which were from Google, in response to
    // undeliverable DMARC reports (IE, automated messages that Google
    // shouldn't have replied to). Another appears to be a valid bounce from
    // a poorly configured mailer, and the 14th was a confirmed spam kill.
    // Unless new data demonstrate otherwise, this should remain disabled.

    // Return-Path, aka Reverse-PATH, Envelope FROM, RFC5321.MailFrom
    // validate that the Return-Path header is empty, RFC 3834

    var rp = connection.transaction.header.get('Return-Path');
    if (!rp) {
        transaction.results.add(plugin, {pass: 'empty_return_path' });
        return next();
    }

    if (rp === '<>') {
        transaction.results.add(plugin, {pass: 'empty_return_path' });
        return next();
    }

    transaction.results.add(plugin, {fail: 'empty_return_path', emit: true });
    return next(DENY, "bounce with non-empty Return-Path (RFC 3834)");
};

exports.bad_rcpt = function (next, connection) {
    var plugin = this;
    var transaction = connection.transaction;

    if (!plugin.cfg.check.bad_rcpt) return next();
    if (!plugin.has_null_sender(connection)) return next();
    if (!plugin.cfg.invalid_addrs) return next();

    for (var i=0; i < connection.transaction.rcpt_to.length; i++) {
        var rcpt = connection.transaction.rcpt_to[i].address();
        if (!plugin.cfg.invalid_addrs[rcpt]) continue;
        transaction.results.add(plugin, {fail: 'bad_rcpt', emit: true });
        return next(DENY, "That recipient does not accept bounces");
    }

    transaction.results.add(plugin, {pass: 'bad_rcpt'});
    return next();
};

exports.has_null_sender = function (connection, mail_from) {
    var plugin = this;
    var transaction = connection.transaction;

    if (!mail_from) mail_from = connection.transaction.mail_from;

    // bounces have a null sender.
    // null sender could also be tested with mail_from.user
    // Why would isNull() exist if it wasn't the right way to test this?

    if (mail_from.isNull()) {
        transaction.results.add(plugin, {isa: 'yes'});
        return true;
    }

    transaction.results.add(plugin, {isa: 'no'});
    return false;
};

exports.non_local_msgid = function (next, connection) {
    var plugin = this;
    if (!plugin.cfg.check.non_local_msgid) return next();
    if (!plugin.has_null_sender(connection)) return next();

    var transaction = connection.transaction;

    // Bounce messages usually contain the headers of the original message
    // in the body. This parses the body, searching for the Message-ID header.
    // It then inspects the contents of that header, extracting the domain part,
    // and then checks to see if that domain is local to this server.

    // NOTE: this only works reliably if *every* message sent has a local
    // domain in the Message-ID. In practice, that means outbound MXes MUST
    // check Message-ID on outbound and modify non-conforming Message-IDs.
    //
    // NOTE 2: Searching the bodytext of a bounce is too simple. The bounce
    // message should exist as a MIME Encoded part. See here for ideas
    //     http://lamsonproject.org/blog/2009-07-09.html
    //     http://lamsonproject.org/docs/bounce_detection.html
    var matches = transaction.body.bodytext.match(/[\r\n]Message-ID: .*?[\r\n]/gi);
    if (!matches) {
        connection.loginfo(plugin, "no Message-ID matches");
        transaction.results.add(plugin, { fail: 'Message-ID' });
        return next(DENY, "bounce without Message-ID in headers, unable to verify that I sent it");
    }

    connection.loginfo(plugin, matches);
    var domains=[];
    for (var i=0; i < matches.length; i++) {
        var res = matches[i].match(/@.*>/i);
        if (!res[0]) continue;
        domains.push(res[0].substring(1, (res[0].length -2)));
    }

    if (domains.length === 0) {
        connection.loginfo(plugin, "no domain(s) parsed from Message-ID headers");
        transaction.results.add(plugin, { fail: 'Message-ID parseable' });
        return next(DENY, "bounce with invalid Message-ID, I didn't send it.");
    }

    connection.loginfo(plugin, domains);

    var valid_domains=[];
    for (var j=0; j < domains.length; j++) {
        var org_dom = net_utils.get_organizational_domain(domains[j]);
        if (!org_dom) { continue; }
        valid_domains.push(org_dom);
    }

    if (valid_domains.length === 0) {
        transaction.results.add(plugin, { fail: 'Message-ID valid domain' });
        return next(DENY, "bounce Message-ID without valid domain, I didn't send it.");
    }

    // we wouldn't have accepted the bounce if the recipient wasn't local
    transaction.results.add(plugin, {fail: 'Message-ID not local', emit: true });
    return next(DENY, "bounce with non-local Message-ID (RFC 3834)");
};
