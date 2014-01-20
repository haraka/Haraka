// bounce tests

exports.register = function () {
    this.register_hook('mail',         'bounce_mail');
    this.register_hook('data',         'bounce_data');
};

exports.bounce_mail = function (next, connection, params) {
    var mail_from = params[0];
    if (!has_null_sender(mail_from)) return next();    // not a bounce
    var cfg = this.config.get('bounce.ini');
    if (cfg.main.reject_all) return next(DENY, "No bounces accepted here");
    return next();
}

exports.bounce_data = function(next, connection) {
    var plugin = connection;

    if (!has_null_sender(connection.transaction.mail_from)) return next();

    var cfg = this.config.get('bounce.ini');
    var rej = cfg.main.reject_invalid;

    var err = has_single_recipient(connection, plugin);
    if (err && rej) return next(DENY, err);

    return next();
};

function has_single_recipient(connection, plugin) {
    if (connection.transaction.rcpt_to.length === 1) return;

    // Valid bounces have a single recipient
    connection.loginfo(plugin, "bogus bounce to: " + 
        connection.transaction.rcpt_to.join(','));

    connection.transaction.notes.bounce='invalid';
    return "this bounce message does not have 1 recipient";
};

function has_null_sender(mail_from) {
    // bounces have a null sender.
    return mail_from.isNull() ? true : false;

    // this could also be tested with.
    // mail_from.user ? false : true
    // Why would isNull() exist if it wasn't the right way to test this?
};
