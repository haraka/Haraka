// I don't allow MAIL FROM:<> on my server, because it's all crap and I send
// so little mail anyway that I rarely get real bounces

exports.hook_mail = function (next, connection, params) {
    var mail_from = params[0];
    if (mail_from.isNull()) {
        return next(DENY, "No bounces accepted here");
    }
    return next();
}
