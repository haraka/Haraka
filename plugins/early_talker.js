// This plugin checks for clients that talk before we sent a response

exports.register = function() {
    this.pause = this.config.get('early_talker.pause', 'value');
    this.register_hook('data', 'check_early_talker');
};

exports.check_early_talker = function(next, connection) {
    if (this.pause) {
        setTimeout(function () { _check_early_talker(connection, next) }, this.pause);
    }
    else {
        _check_early_talker(connection, next);
    }
};

var _check_early_talker = function (connection, next) {
    if (connection.early_talker) {
        next(DENYDISCONNECT, "You talk too soon");
    }
    else {
        next();
    }
};
