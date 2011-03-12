var constants = require('../constants');

exports.register = function() {
    this.register_hook('rcpt', 'confirm_all');
};

exports.confirm_all = function(callback, params) {
    var recipient = params.shift();
    this.loginfo("confirming recipient " + recipient);
    callback(constants.ok);
};
