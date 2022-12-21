// dnsbl plugin

exports.register = function () {
    this.inherits('dns_list_base');

    this.load_config();

    if (this.cfg.main.periodic_checks) {
        this.check_zones(this.cfg.main.periodic_checks);
    }

    if (this.cfg.main.search === 'all') {
        this.register_hook('connect',  'connect_multi');
    }
    else {
        this.register_hook('connect',  'connect_first');
    }
}

exports.load_config = function () {
    
    this.cfg = this.config.get('dnsbl.ini', {
        booleans: ['+main.reject', '-main.enable_stats'],
    }, () => {
        this.load_config();
    });

    if (this.cfg.main.enable_stats && !this.enable_stats) {
        this.loginfo('stats reporting enabled');
        this.enable_stats = true;
    }
    if (!this.cfg.main.enable_stats && this.enable_stats) {
        this.loginfo('stats reporting disabled');
        this.enable_stats = false;
    }

    if (this.cfg.main.stats_redis_host &&
        this.cfg.main.stats_redis_host !== this.redis_host) {
        this.redis_host = this.cfg.main.stats_redis_host;
        this.loginfo(`set stats redis host to: ${this.redis_host}`);
    }

    this.get_uniq_zones();
}

exports.get_uniq_zones = function () {
    this.zones = [];

    const unique_zones = {};

    // Compatibility with old plugin
    const legacy_zones = this.config.get('dnsbl.zones', 'list');
    for (const legacyZone of legacy_zones) {
        unique_zones[legacyZone] = true;
    }

    if (this.cfg.main.zones) {
        const new_zones = this.cfg.main.zones.split(/[\s,;]+/);
        for (const newZone of new_zones) {
            unique_zones[newZone] = true;
        }
    }

    for (const key in unique_zones) { this.zones.push(key); }
    return this.zones;
}

exports.should_skip = function (connection) {
    
    if (!connection) { return true; }

    if (connection.remote.is_private) {
        connection.logdebug(this, `skip private: ${connection.remote.ip}`);
        return true;
    }

    if (!this.zones || !this.zones.length) {
        connection.logerror(this, "no zones");
        return true;
    }

    return false;
}

exports.connect_first = function (next, connection) {
    const plugin = this;
    const remote_ip = connection.remote.ip;

    if (plugin.should_skip(connection)) { return next(); }

    plugin.first(remote_ip, plugin.zones, (err, zone, a) => {
        if (err) {
            connection.results.add(plugin, {err: err.message});
            return next();
        }
        if (!a) return next();

        const msg = `host [${remote_ip}] is blacklisted by ${zone}`;
        if (plugin.cfg.main.reject) return next(DENY, msg);

        connection.loginfo(plugin, msg);
        return next();
    }, function each_result (err, zone, a) {
        if (err) return;
        const result = a ? {fail: zone} : {pass: zone};
        connection.results.add(plugin, result);
    });
}

exports.connect_multi = function (next, connection) {
    const remote_ip = connection.remote.ip;

    if (this.should_skip(connection)) { return next(); }

    const hits = [];
    function get_deny_msg () {
        return `host [${remote_ip}] is blacklisted by ${hits.join(', ')}`;
    }

    this.multi(remote_ip, this.zones, (err, zone, a, pending) => {
        if (err) {
            connection.results.add(this, {err: err.message});
            if (pending) return;
            if (this.cfg.main.reject && hits.length) {
                return next(DENY, get_deny_msg());
            }
            return next();
        }

        if (a) {
            hits.push(zone);
            connection.results.add(this, {fail: zone});
        }
        else {
            if (zone) connection.results.add(this, {pass: zone});
        }

        if (pending) return;
        connection.results.add(this, {emit: true});

        if (this.cfg.main.reject && hits.length) {
            return next(DENY, get_deny_msg());
        }
        return next();
    });
}
