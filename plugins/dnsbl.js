// dnsbl plugin

var cfg;

exports.register = function() {
    cfg = this.config.get('dnsbl.ini');
    this.inherits('dns_list_base');

    if (cfg.main.enable_stats) {
        this.logdebug('stats reporting enabled');
        this.enable_stats = 1;
    }

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
    if (!this.zones || !this.zones.length) {
        connection.logerror(this, "no zones");
        return next();
    }
    var self = this;
    this.first(connection.remote_ip, this.zones, function (err, zone, a) {
        if (a) {
            return next(DENY, 'host [' + connection.remote_ip + '] is blacklisted by ' + zone);
        }
        return next();
    });
}
