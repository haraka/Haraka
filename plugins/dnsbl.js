// dnsbl plugin

exports.register = function() {
    var plugin = this;
    plugin.inherits('dns_list_base');

    plugin.refresh_config();

    if (plugin.cfg.main.periodic_checks) {
        plugin.check_zones(plugin.cfg.main.periodic_checks);
    }

    if (plugin.cfg.main.search === 'all') {
        plugin.register_hook('connect',  'connect_multi');
    }
    else {
        plugin.register_hook('connect',  'connect_first');
    }
};

exports.refresh_config = function () {
    var plugin = this;

    var load_cfg = function () {
        plugin.cfg = plugin.config.get('dnsbl.ini', {
            booleans: ['+main.reject', '-main.enable_stats'],
        }, load_cfg);

        if (plugin.cfg.main.enable_stats && !plugin.enable_stats) {
            plugin.loginfo('stats reporting enabled');
            plugin.enable_stats = true;
        }
        if (!plugin.cfg.main.enable_stats && plugin.enable_stats) {
            plugin.loginfo('stats reporting disabled');
            plugin.enable_stats = false;
        }

        if (plugin.cfg.main.stats_redis_host && plugin.cfg.main.stats_redis_host !== plugin.redis_host) {
            plugin.redis_host = plugin.cfg.main.stats_redis_host;
            plugin.loginfo('set stats redis host to: ' + plugin.redis_host);
        }

        plugin.get_uniq_zones();
    };
    load_cfg();
};

exports.get_uniq_zones = function () {
    var plugin = this;
    plugin.zones = [];

    var unique_zones = {};

    // Compatibility with old plugin
    var legacy_zones = this.config.get('dnsbl.zones', 'list');
    for (var i=0; i < legacy_zones.length; i++) {
        unique_zones[legacy_zones[i]] = true;
    }

    if (plugin.cfg.main.zones) {
        var new_zones = plugin.cfg.main.zones.split(/[\s,;]+/);
        for (var h=0; h < new_zones.length; h++) {
            unique_zones[new_zones[h]] = true;
        }
    }

    for (var key in unique_zones) { plugin.zones.push(key); }
    return this.zones;
};

exports.connect_first = function(next, connection) {

    if (!this.zones || !this.zones.length) {
        connection.logerror(this, "no zones");
        return next();
    }

    var plugin = this;
    this.first(connection.remote_ip, this.zones, function (err, zone, a) {
        if (err) {
            connection.logerror(plugin, err);
            return next();
        }
        if (!a) return next();

        var msg = 'host [' + connection.remote_ip + '] is blacklisted by ' + zone;
        if (plugin.cfg.main.reject) return next(DENY, msg);

        connection.loginfo(plugin, msg);
        return next();
    });
};

exports.connect_multi = function(next, connection) {
    var plugin = this;

    if (!plugin.zones || !plugin.zones.length) {
        connection.logerror(plugin, "no enabled zones");
        return next();
    }

    var hits = [];
    plugin.multi(connection.remote_ip, plugin.zones, function (err, zone, a, pending) {
        if (err) {
            connection.results.add(plugin, {err: err});
            if (pending > 0) return;
            if (plugin.cfg.main.reject && hits.length) return next(DENY,
                'host [' + connection.remote_ip + '] is blacklisted by ' + hits.join(', '));
            return next();
        }

        if (a) {
            hits.push(zone);
            connection.results.add(plugin, {fail: zone});
        }
        else {
            connection.results.add(plugin, {pass: zone});
        }

        if (pending > 0) return;
        connection.results.add(plugin, {emit: true});

        if (plugin.cfg.main.reject && hits.length) return next(DENY,
            'host [' + connection.remote_ip + '] is blacklisted by ' + hits.join(', '));
        return next();
    });
};
