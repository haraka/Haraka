// This plugin checks for clients that talk before we sent a response

exports.register = function() {
    var plugin = this;
    plugin.load_config();
    plugin.register_hook('connect_init', 'early_talker');
    plugin.register_hook('data', 'early_talker');
};

exports.load_config = function () {
    var plugin = this;
    // config/early_talker.pause is in milliseconds
    plugin.pause = plugin.config.get('early_talker.pause', function () {
        plugin.load_config();
    });
};

exports.early_talker = function(next, connection) {
    var plugin = this;
    if (!plugin.pause) return next();
    if (connection.relaying) {
        // Don't delay AUTH/RELAY clients
        if (connection.early_talker) {
            connection.results.add(plugin,
                    { skip: 'an early talking relaying client?!'});
        }
        return next();
    }

    var check = function () {
        if (!connection.early_talker) return next();
        return next(DENYDISCONNECT, "You talk too soon");
    }

    var elapsed = (Date.now() - connection.start_time);
    if (elapsed > plugin.pause && plugin.hook === 'connect_init') {
        // Something else already waited
        return check();
    }
    else {
        setTimeout(function () {
            return check();
        }, plugin.pause);
    }
};
