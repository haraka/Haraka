// This plugin checks for clients that talk before we sent a response

exports.register = function() {
    this.register_hook('data', 'check_early_talker');
};

exports.check_early_talker = function(next, connection) {
    var pause = this.config.get('early_talker.pause');
    if (pause) {
        setTimeout(function () { _check_early_talker(connection, next) }, pause);
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
