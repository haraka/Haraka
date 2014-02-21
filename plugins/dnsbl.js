// dnsbl plugin

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
}

exports.hook_connect = function(next, connection) {
    var plugin = this;
    if (!plugin.zones || !plugin.zones.length) {
        connection.logerror(plugin, "no zones");
        return next();
    }
    plugin.first(connection.remote_ip, plugin.zones, function (err, zone, a) {
        if (a) {
            var msg = 'host [' + connection.remote_ip + '] is blacklisted by ' + zone;
            if (reject) {
                return next(DENY, msg);
            }
            connection.loginfo(plugin, msg);
            return next();
        }
        return next();
    });
}
