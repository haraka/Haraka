// Block mail from matching anything in the list
const utils = require('haraka-utils');

exports.register = function () {
    this.logwarn("NOTICE: plugin deprecated, use 'mail_from.access' instead!");
}

exports.hook_mail = function (next, connection, params) {
    const mail_from = params[0].address();
    const list = this.config.get('mail_from.blocklist', 'list');
    if (utils.in_array(mail_from, list)) {
        return next(DENY, "Mail from you is not allowed here");
    }
    return next();
}
