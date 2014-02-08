// bounce tests

exports.register = function () {
    this.inherits('note');
};

exports.hook_mail = function (next, connection, params) {
    var plugin = this;
    var mail_from = params[0];
    plugin.note_init({conn: connection, txn: true, plugin: this});

    if (!plugin.has_null_sender(connection, mail_from)) {
        return next(); // bounce messages are from null senders
    }

    var cfg = this.config.get('bounce.ini');
    if (cfg.main.reject_all) {
        this.note({conn: connection, fail: 'bounces_accepted', emit: 1 });
        return next(DENY, "No bounces accepted here");
    }
    return next();
};

exports.hook_data = function(next, connection) {
    var plugin = this;
    if (!plugin.has_null_sender(connection)) return next();

    var cfg = this.config.get('bounce.ini');
    var rej = cfg.main.reject_invalid;

    var err = plugin.has_single_recipient(connection);
    if (err && rej) return next(DENY, err);

    return next();
};

exports.bounce_data_post = function(next, connection) {

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
    var plugin = this;
    if (!plugin.has_null_sender(connection.transaction.mail_from)) return next();
    var rp = connection.transaction.header.get('Return-Path');
    if (rp && rp !== '<>') {
        connection.loginfo(plugin, "bounce with non-empty Return-Path");
        return next(DENY, "bounce with non-empty Return-Path (RFC 3834)");
    }
    return next();
};

function has_single_recipient(connection) {
    if (connection.transaction.rcpt_to.length === 1) {
        plugin.note({conn: connection, pass: 'has_single_recipient', emit: true });
        return;
    }

    // Valid bounces have a single recipient
    connection.loginfo(plugin, "bounce with too many recipients to: " +
        connection.transaction.rcpt_to.join(','));

    plugin.note({conn: connection, fail: 'has_single_recipient', emit: true });
    return "this bounce message does not have 1 recipient";
}

exports.has_null_sender = function (connection, mail_from) {
    var plugin = this;
    if (!mail_from) mail_from = connection.transaction.mail_from;

    // bounces have a null sender.
    // null sender could also be tested with mail_from.user
    // Why would isNull() exist if it wasn't the right way to test this?

    if (mail_from.isNull()) {
        plugin.note({conn: connection, isa: 'yes' });
        return true;
    }

    plugin.note({conn: connection, isa: 'no', emit: true });
    return false;
};
