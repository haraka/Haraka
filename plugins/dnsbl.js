// dnsbl plugin

exports.register = function() {
    this.inherits('dns_list_base');
    this.zones = this.config.get('dnsbl.zones', 'list');
    if (this.config.get('dnsbl.periodic_checks', 'value')) {
        this.check_zones(this.zones);
    }
    this.register_hook('connect', 'check_ip');
}

exports.check_ip = function(next, connection) {
    connection.logdebug(this, "check_ip: " + connection.remote_ip);
    
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
