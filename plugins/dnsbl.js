// dnsbl plugin

var constants = require('../constants');
var config    = require('../config');
var dns       = require('dns');

exports.register = function() {
    this.zones = config.get('dnsbl.zones');
    this.register_hook('connect', 'check_ip');
}

exports.check_ip = function(callback, connection) {
    this.logdebug("check_ip: " + connection.remote_ip);
    
    var ip = new String(connection.remote_ip);
    var reverse_ip = ip.split('.').reverse().join('.');
    
    if (!this.zones || !this.zones.length) {
        this.logerror("No zones");
        return callback(constants.declined);
    }
    
    var remaining_zones = [];
    
    var self = this;
    this.zones.forEach(function(zone) {
        dns.resolve(reverse_ip + "." + zone, "TXT", function (err, value) {
            remaining_zones.pop(); // we don't care about order really
            if (err) {
                self.loginfo("DNS error: " + err);
                if (remaining_zones.length === 0) {
                    // only call declined if no more results are pending
                    return callback(constants.declined);
                }
            }
            return callback(constants.deny, value);
        });
        
        remaining_zones.push(zone);
    });
    
}
