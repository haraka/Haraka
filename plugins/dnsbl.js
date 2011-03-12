// dnsbl plugin

var logger    = require('../logger');
var constants = require('../constants');
var config    = require('../config');
var dns       = require('dns');

exports.register = function() {
    this.zones = config.get('dnsbl.zones');
    this.register_hook('connect', 'check_ip');
}

exports.check_ip = function(callback) {
    logger.log("check_ip: " + this.connection.remote_ip);
    
    var ip = new String(this.connection.remote_ip);
    var reverse_ip = ip.split('.').reverse().join('.');
    
    if (!this.zones || !this.zones.length) {
        logger.log("No zones");
        return callback(constants.declined);
    }
    
    var remaining_zones = [];
    
    this.zones.forEach(function(zone) {
        dns.resolve(reverse_ip + "." + zone, "TXT", function (err, value) {
            remaining_zones.pop(); // we don't care about order really
            if (err) {
                logger.log("DNS error: " + err);
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
