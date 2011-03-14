// This plugin checks for clients that talk before we sent a response

var smtp = require('../constants');

exports.register = function() {
    this.pause = this.config.get('early_talker.pause', 'value');
    this.register_hook('data', 'check_early_talker');
};

exports.check_early_talker = function(callback, connection) {
    if (this.pause) {
        setTimeout(function () { _check_early_talker(connection, callback) }, this.pause);
    }
    else {
        _check_early_talker(connection, callback);
    }
};

var _check_early_talker = function (connection, callback) {
    if (connection.early_talker) {
        callback(smtp.denydisconnect, "You talk too soon");
    }
    else {
        callback(smtp.cont);
    }
};
