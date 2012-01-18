// dnswl plugin

var cfg;

exports.register = function() {
    cfg = this.config.get('dnswl.ini');
    this.inherits('dns_list_base');

    if (cfg.main.enable_stats) {
        this.logdebug('stats reporting enabled');
        this.enable_stats = 1;
    }

    this.zones = [];
    // Compatibility with old-plugin
    this.zones = this.zones.concat(this.config.get('dnswl.zones', 'list'));
    if (cfg.main.zones) {
        this.zones = this.zones.concat(cfg.main.zones.replace(/\s+/g,'').split(/[;,]/));
    }

    if (cfg.main.periodic_checks) {
        this.check_zones(cfg.main.periodic_checks);
    }

    var self = this;
    ['ehlo','helo','mail','rcpt'].forEach(function (hook) {
        self.register_hook(hook, 'check_dnswl');
    });
}           
            
exports.check_dnswl = function (next, connection) {
    (connection.notes.dnswl) ? next(OK) : next();
}

exports.hook_connect = function(next, connection) {
    if (!this.zones || !this.zones.length) {
        connection.logerror(this, "no zones");
        return next();
    }
    var self = this;
    this.first(connection.remote_ip, this.zones, function (err, zone, a) {
        if (a) {
            connection.loginfo(self, connection.remote_ip + ' is whitelisted by ' + zone + ': ' + a);
            connection.notes.dnswl = true;
            return next(OK);
        }
        return next();
    });
}
