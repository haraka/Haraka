// dnsbl plugin

var reject=true;

exports.register = function() {
    var cfg = this.config.get('dnsbl.ini');
    this.inherits('dns_list_base');

    this.refresh_config();

    this.zones = [];
    // Compatibility with old-plugin
    this.zones = this.zones.concat(this.config.get('dnsbl.zones', 'list'));
    if (cfg.main.zones) {
        this.zones = this.zones.concat(cfg.main.zones.replace(/\s+/g,'').split(/[;,]/));
    }

    if (cfg.main.periodic_checks) {
        this.check_zones(cfg.main.periodic_checks);
    }

    if (cfg.main.search && cfg.main.search === 'all') {
        this.register_hook('connect',  'connect_multi');
    }
    else {
        this.register_hook('connect',  'connect_first');
    }
};

exports.refresh_config = function () {
    var cfg = this.config.get('dnsbl.ini');

    this.logdebug('reject: ' + reject);

    if (cfg.main.reject && !reject) {
        this.loginfo('reject enabled: ' + cfg.main.reject);
        reject = true;
    }
    if (!cfg.main.reject && reject) {
        this.loginfo('reject disabled: ' + cfg.main.reject);
        reject = false;
    }

    if (cfg.main.enable_stats && !this.enable_stats) {
        this.loginfo('stats reporting enabled');
        this.enable_stats = true;
    }
    if (!cfg.main.enable_stats && this.enable_stats) {
        this.loginfo('stats reporting disabled');
        this.enable_stats = false;
    }

    if (cfg.main.stats_redis_host && cfg.main.stats_redis_host !== this.redis_host) {
        this.redis_host = cfg.main.stats_redis_host;
        this.loginfo('set stats redis host to: ' + this.redis_host);
    }
};

exports.connect_first = function(next, connection) {

    if (!this.zones || !this.zones.length) {
        connection.logerror(this, "no zones");
        return next();
    }

    this.refresh_config();

    var plugin = this;
    this.first(connection.remote_ip, this.zones, function (err, zone, a) {
        if (err) {
            connection.logerror(plugin, err);
            return next();
        }
        if (!a) return next();

        var msg = 'host [' + connection.remote_ip + '] is blacklisted by ' + zone;
        if (reject) return next(DENY, msg);

        connection.loginfo(plugin, msg);
        return next();
    });
};

exports.connect_multi = function(next, connection) {
    var plugin = this;
    var hits = [];

    plugin.refresh_config();

    plugin.multi(connection.remote_ip, plugin.zones, function (err, zone, a, pending) {
        if (err) {
            if (connection.results) connection.results.add(plugin, {err: err});
            if (pending > 0) return;
            if (reject && hits.length) return next(DENY,
                'host [' + connection.remote_ip + '] is blacklisted by ' + hits.join(', '));
            return next();
        }

        if (a) {
            hits.push(zone);
            if (connection.results) connection.results.add(plugin, {fail: zone});
        }
        else {
            if (connection.results) connection.results.add(plugin, {pass: zone});
        }

        if (pending > 0) return;
        if (connection.results) connection.results.add(plugin, {emit: true});

        if (reject && hits.length) return next(DENY,
            'host [' + connection.remote_ip + '] is blacklisted by ' + hits.join(', '));
        return next();
    });
};
