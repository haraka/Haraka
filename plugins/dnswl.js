// dnswl plugin

exports.register = function() {
    this.inherits('dns_list_base');
    this.zones = this.config.get('dnswl.zones', 'list');
    if (this.config.get('dnswl.periodic_checks', 'value')) {
        this.check_zones(this.zones);
    }
    this.register_hook('connect', 'check_ip');
    var self = this;
    ['ehlo','helo','mail','rcpt'].forEach(function (hook) {
        self.register_hook(hook, 'check_dnswl');
    });
}           
            
exports.check_dnswl = function (next, connection) {
    (connection.notes.dnswl) ? next(OK) : next();
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
            connection.loginfo(self, connection.remote_ip + ' is whitelisted by ' + zone + ': ' + a);
            connection.notes.dnswl = true;
            return next(OK);
        }
        return next();
    });
}
