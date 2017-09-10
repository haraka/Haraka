'use strict';
// Block mail from matching anything in the list
const utils = require('haraka-utils');

exports.register = function () {
    this.logwarn("NOTICE: plugin deprecated, use 'rcpt_to.access' instead!");
};

exports.hook_rcpt = function (next, connection, params) {
    const rcpt_to = params[0].address();
    const list = this.config.get('rcpt_to.blocklist', 'list');
    if (utils.in_array(rcpt_to, list)) {
        return next(DENY, "Mail to " + rcpt_to + "is not allowed here");
    }
    return next();
};
