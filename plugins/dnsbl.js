// dnsbl plugin

var dns   = require('dns');
var utils = require('./utils.js');

exports.register = function() {
    this.zones = this.config.get('dnsbl.zones', 'list');
    this.v6zones = this.config.get('dnsbl6.zones', 'list');
    this.register_hook('connect', 'check_ip');
}

exports.check_ip = function(next, connection) {
    this.logdebug("check_ip: " + connection.remote_ip);
    
    var ip = new String(connection.remote_ip);
    var reverse_ip, zones;
    if (utils.is_ipv4(ip)) {
        reverse_ip = ip.split('.').reverse().join('.');

        if (!this.zones || !this.zones.length) {
            this.logerror("No zones");
            return next();
        }

        zones = this.zones
    }
    else if (utils.is_ipv6(ip)) {
        reverse_ip = utils.expand_ipv6(ip).replace(/:/g,'').split('').reverse().join('.');

        if (!this.v6zones || !this.v6zones.length) {
            this.logerror("No ipv6 zones");
            return next();
        }

        zones = this.v6zones
    }
    else {
        this.logerror(ip + " is not a valid internet address!");
        return next();
    }
    
    
    var remaining_zones = [];
    
    var self = this;
    zones.forEach(function(zone) {
        self.logdebug("Querying: " + reverse_ip + "." + zone);
        dns.resolve(reverse_ip + "." + zone, "TXT", function (err, value) {
            if (!remaining_zones.length) return;
            remaining_zones.pop(); // we don't care about order really
            if (err) {
                switch (err.code) {
                    case dns.NOTFOUND:
                    case dns.NXDOMAIN:
                    case 'ENOTFOUND':
                                        break;
                    default:
                        self.loginfo("DNS error: " + err);
                }
                if (remaining_zones.length === 0) {
                    // only call declined if no more results are pending
                    return next();
                }
                return;
            }
            remaining_zones = [];
            return next(DENY, value);
        });
        
        remaining_zones.push(zone);
    });
    
}
