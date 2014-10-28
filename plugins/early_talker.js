// This plugin checks for clients that talk before we sent a response

exports.register = function() {
    var plugin = this;

    var load_config = function () {
        // config/early_talker.pause is in milliseconds
        plugin.pause = plugin.config.get('early_talker.pause', load_config);
    };
    load_config();

    plugin.register_hook('data', 'early_talker');
};

exports.early_talker = function(next, connection) {
    var plugin = this;
    if (!plugin.pause      ) { return next(); } // config set to 0
    if (connection.relaying) { return next(); } // Don't pause AUTH/RELAY clients

    setTimeout(function () {
        if (!connection.early_talker) { return next(); }
        next(DENYDISCONNECT, "You talk too soon");
    }, plugin.pause);
};
