// This plugin checks for clients that talk before we sent a response

exports.register = function() {
    var plugin = this;
    plugin.load_config();
    plugin.register_hook('connect_init', 'early_talker');
    plugin.register_hook('data',         'early_talker');
};

exports.load_config = function () {
    var plugin = this;

    plugin.cfg = plugin.config.get('early_talker.ini', {
        booleans: [
            '+main.reject',
        ]
    },
    function () {
        plugin.load_config();
    });

    if (plugin.cfg.main && plugin.cfg.main.pause) {
        plugin.pause = plugin.cfg.main.pause * 1000;
        return;
    }

    // config/early_talker.pause is in milliseconds
    plugin.pause = plugin.config.get('early_talker.pause', function () {
        plugin.load_config();
    });
};

exports.early_talker = function(next, connection) {
    var plugin = this;
    if (!plugin.pause) return next();

    if (connection.relaying) {    // Don't delay AUTH/RELAY clients
        if (connection.early_talker) {
            connection.results.add(plugin, { skip: 'relay client'});
        }
        return next();
    }

    var check = function () {
        if (!connection) return next();
        if (!connection.early_talker) {
            connection.results.add(plugin, {pass: 'early'});
            return next();
        }
        connection.results.add(plugin, {fail: 'early'});
        if (!plugin.cfg.main.reject) return next();
        return next(DENYDISCONNECT, "You talk too soon");
    };

    var pause = plugin.pause;
    if (plugin.hook === 'connect_init') {
        var elapsed = (Date.now() - connection.start_time);
        if (elapsed > plugin.pause) {
            // Something else already waited
            return check();
        }
        pause = plugin.pause - elapsed;
    }

    setTimeout(function () { check(); }, pause);
};
