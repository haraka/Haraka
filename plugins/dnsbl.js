// dnsbl plugin

var Note = require('./note');
var cfg;
var reject=true;

exports.register = function() {
    cfg = this.config.get('dnsbl.ini');
    this.inherits('dns_list_base');

    if (cfg.main.enable_stats) {
        this.logdebug('stats reporting enabled');
        this.enable_stats = true;
    }

    if (cfg.main.stats_redis_host) {
        this.redis_host = cfg.main.stats_redis_host;
        this.logdebug('set stats redis host to: ' + this.redis_host);
    }

    if (cfg.main.reject !== 'undefined') reject = cfg.main.reject;

    this.zones = [];
    // Compatibility with old-plugin
    this.zones = this.zones.concat(this.config.get('dnsbl.zones', 'list'));
    if (cfg.main.zones) {
        this.zones = this.zones.concat(cfg.main.zones.replace(/\s+/g,'').split(/[;,]/));
    }

    if (cfg.main.periodic_checks) {
        this.check_zones(cfg.main.periodic_checks);
    } 

    if (!this.zones || !this.zones.length) {
        return;
    }

    if (cfg.main.search && cfg.main.search === 'all') {
        this.register_hook('connect',  'connect_multi');
    }
    else {
        this.register_hook('connect',  'connect_first');
    }
}

exports.connect_first = function(next, connection) {
    var plugin = this;
    plugin.note = new Note(connection, plugin);

    this.first(connection.remote_ip, this.zones, function (err, zone, a) {
        if (a) {
            plugin.note.save({ fail: zone, emit: true });
            if (reject) {
                return next(DENY, 'host [' + connection.remote_ip + '] is blacklisted by ' + zone);
            }
            return next();
        }
        plugin.note.save({ pass: zone, emit: true });
        return next();
    });
};

exports.connect_multi = function(next, connection) {
    var plugin = this;
    plugin.note = new Note(connection, plugin);

    this.multi(connection.remote_ip, this.zones, function (err, zone, a, pending) {
        if ( a) plugin.note.save({fail: zone});
        if (!a) plugin.note.save({pass: zone});

        if (pending > 0) return;
        plugin.note.save({emit: true});

        if (!a) return next();
        if (reject) {
            return next(DENY, 'host [' + connection.remote_ip + '] is blacklisted by ' + zone);
        }
        return next();
    });
};
