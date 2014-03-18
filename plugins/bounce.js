// bounce tests

exports.register = function () {
    var plugin = this;
    plugin.register_hook('data',       'reject_invalid');
    plugin.register_hook('data_post',  'with_return_path');
    plugin.register_hook('data_post',  'bad_bounce_to');
};

exports.hook_mail = function (next, connection, params) {
    var plugin = this;
    var mail_from = params[0];

    if (!plugin.has_null_sender(connection, mail_from)) {
        return next(); // bounce messages are from null senders
    }

    plugin.cfg = plugin.config.get('bounce.ini',
        { booleans: ['main.reject_all', 'main.reject_invalid'] }
    );

    if (plugin.cfg.main.reject_all) {
        connection.results.add(plugin, {fail: 'bounces_accepted', emit: 1 });
        return next(DENY, "No bounces accepted here");
    }

    plugin.cfg.invalid_addrs = plugin.config.get('bounce_badto', 'list');

    return next();
};

exports.reject_invalid = function(next, connection) {
    var plugin = this;
    if (!plugin.has_null_sender(connection)) return next();

    var err = plugin.multiple_recipients(connection);
    if (!err) return next();

    if (!plugin.cfg.main.reject_invalid) return next();

    return next(DENY, err);
};

exports.with_return_path = function(next, connection) {
    var plugin = this;
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
    if (rp && rp !== '<>') {
        connection.results.add(plugin, {fail: 'with_return_path', emit: 1 });
        return next(DENY, "bounce with non-empty Return-Path (RFC 3834)");
    }

    connection.results.add(plugin, {pass: 'with_return_path' });
    return next();
};

exports.bad_bounce_to = function(next, connection) {
    var plugin = this;
    if (!plugin.has_null_sender(connection)) return next();
    if (!plugin.cfg.invalid_addrs) return next();
    for (var i=0; i < connection.transaction.rcpt_to.length; i++) {
        var rcpt = connection.transaction.rcpt_to[i].address();
        if (!plugin.cfg.invalid_addrs[rcpt]) continue;
        connection.results.add(plugin, {fail: 'bad_bounce_to', emit: 1 });
        return next(DENY, "That recipient does not accept bounces");
    }

    connection.results.add(plugin, {pass: 'bad_bounce_to'});
    return next();
};

exports.multiple_recipients = function (connection) {
    var plugin = this;
    if (connection.transaction.rcpt_to.length === 1) {
        connection.results.add(plugin, {pass: 'multiple_recipients', emit: true });
        return false;
    }

    // Valid bounces have a single recipient
    connection.loginfo(plugin, "bounce with too many recipients to: " +
        connection.transaction.rcpt_to.join(','));

    connection.results.add(plugin, {fail: 'multiple_recipients', emit: true });
    return "this bounce message does not have 1 recipient";
};

exports.has_null_sender = function (connection, mail_from) {
    var plugin = this;
    if (!mail_from) mail_from = connection.transaction.mail_from;

    // bounces have a null sender.
    // null sender could also be tested with mail_from.user
    // Why would isNull() exist if it wasn't the right way to test this?

    if (mail_from.isNull()) {
        connection.results.add(plugin, {isa: 'yes'});
        return true;
    }

    connection.results.add(plugin, {isa: 'no', emit: true});
    return false;
};
