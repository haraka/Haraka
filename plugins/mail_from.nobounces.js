// I don't allow MAIL FROM:<> on my server, because it's all crap and I send
// so little mail anyway that I rarely get real bounces

// this plugin is deprecated. Use the 'bounce' plugin instead, and set
// config/bounce.ini reject_all=1

exports.register = function () {
    this.logwarn("NOTICE: plugin deprecated, use 'bounce' instead!");
}

exports.hook_mail = function (next, connection, params) {
    var mail_from = params[0];
    if (mail_from.isNull()) {
        return next(DENY, "No bounces accepted here");
    }
    return next();
}
