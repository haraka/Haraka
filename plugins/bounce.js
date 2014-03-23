// bounce tests

exports.register = function () {
    var plugin = this;
    plugin.register_hook('mail',      'refresh_config');
    plugin.register_hook('mail',      'reject_all');
    plugin.register_hook('data',      'single_recipient');
    plugin.register_hook('data',      'bad_rcpt');
    plugin.register_hook('data_post', 'empty_return_path');
};

exports.refresh_config = function (next, connection) {
    var plugin = this;

    plugin.cfg = plugin.config.get('bounce.ini', {
        booleans: [
            '-check.reject_all',
            '+check.single_recipient',
            '-check.empty_return_path',
            '+check.bad_rcpt',

            '+reject.single_recipient',
            '-reject.empty_return_path',
        ],
    });

    // Legacy config handling
    if (plugin.cfg.main.reject_invalid) {
        connection.logerror(plugin, "bounce.ini is out of date, please update!");
        plugin.cfg.check.single_recipient=true;
        plugin.cfg.reject.single_recipient=true;
    }

    if (plugin.cfg.main.reject_all) {
        connection.logerror(plugin, "bounce.ini is out of date, please update!");
        plugin.cfg.check.reject_all=true;
    }

    plugin.cfg.invalid_addrs = plugin.config.get('bounce_bad_rcpt', 'list');
    return next();
};

exports.reject_all = function (next, connection, params) {
    var plugin = this;
    var transaction = connection.transaction;

    if (!plugin.cfg.check.reject_all) return next();
    var mail_from = params[0];

    if (!plugin.has_null_sender(connection, mail_from)) {
        return next(); // bounce messages are from null senders
    }

    transaction.results.add(plugin, {fail: 'bounces_accepted', emit: true });
    return next(DENY, "No bounces accepted here");
};

exports.single_recipient = function(next, connection) {
    var plugin = this;
    var transaction = connection.transaction;

    if (!plugin.cfg.check.single_recipient) return next();
    if (!plugin.has_null_sender(connection)) return next();

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
    var transaction = connection.transaction;

    if (!plugin.cfg.check.empty_return_path) return next();
    if (!plugin.has_null_sender(connection)) return next();

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
        if (plugin.cfg.invalid_addrs.indexOf(rcpt) === -1) continue;
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
