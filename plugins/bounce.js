// bounce tests

exports.register = function () {
    var plugin = this;

    this.register_hook('mail',         'bounce_mail');
    // this.register_hook('rcpt',         'bounce_rcpt');
    // this.register_hook('data',         'bounce_data');
    this.register_hook('data_post',    'bounce_data_post');
};

exports.bounce_mail = function (next, connection, params) {
    var mail_from = params[0];
    if (!mail_from.isNull()) return next();    // not a bounce
    var cfg = this.config.get('bounce.ini');
    if (cfg.reject_all)
        return next(DENY, "No bounces accepted here");
    return next();
}

exports.bounce_data_post = function(next, connection) {
    var plugin = connection;

    if (!has_null_sender(connection)) return next(); // not a bounce.

    var cfg = this.config.get('bounce.ini');
    var rej = cfg.reject_invalid;

    // Valid bounces have a single recipient
    var err = has_single_recipient(connection, plugin);
    if (err && rej) return next(DENY, err);

    // validate that Return-Path is empty, RFC 3834
    err = has_empty_return_path(connection, plugin);
    if (err && rej) return next(DENY, err);

    return next();
};

function has_empty_return_path(connection, plugin) {
    var rp = connection.transaction.header.get('Return-Path');
    if (!rp) return;
    if (rp === '<>') return;
    connection.transaction.notes.bounce='invalid';
    connection.loginfo(plugin, "bounce messages must not have a Return-Path");
    return "a bounce return path must be empty (RFC 3834)";
};

function has_single_recipient(connection, plugin) {
    if (connection.transaction.rcpt_to.length === 1) return;

    connection.loginfo(plugin, "bogus bounce to: " + 
        connection.transaction.rcpt_to.join(','));

    connection.transaction.notes.bounce='invalid';
    return "this bounce message does not have 1 recipient";
};

function has_null_sender(connection) {
    return connection.transaction.mail_from.isNull() ? true : false;
};
