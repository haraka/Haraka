var logger    = require('../logger');
var constants = require('../constants');

exports.register = function() {
    this.register_hook('rcpt', 'confirm_all');
};

exports.confirm_all = function(callback, params) {
    console.log(params);
    var recipient = params.shift();
    logger.log("confirming recipient " + recipient);
    callback(constants.ok);
};
