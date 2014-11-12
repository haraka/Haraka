'use strict';
// Block mail from matching anything in the list
var utils = require('./utils');

exports.register = function () {
    this.logwarn("NOTICE: plugin deprecated, use 'rcpt_to.access' instead!");
};

exports.hook_rcpt = function (next, connection, params) {
    var rcpt_to = params[0].address();
    var list = this.config.get('rcpt_to.blocklist', 'list');
    if (utils.in_array(rcpt_to, list)) {
        return next(DENY, "Mail to " + rcpt_to + "is not allowed here");
    }
    return next();
};
