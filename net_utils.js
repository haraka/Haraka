"use strict";
var logger = require('./logger');
var config = require('./config');
var isIPv4 = require('net').isIPv4;

// Regexp to match private IPv4 ranges
var re_private_ipv4 = /(?:10|127|169\.254|172\.(?:1[6-9]|2[0-9]|3[01])|192\.168)\..*/;

var top_level_tlds = {};
config.get('top-level-tlds','list').forEach(function (tld) {
    top_level_tlds[tld.toLowerCase()] = 1;
});

var two_level_tlds = {};
config.get('two-level-tlds', 'list').forEach(function (tld) {
    two_level_tlds[tld.toLowerCase()] = 1;
});

var three_level_tlds = {};
config.get('three-level-tlds', 'list').forEach(function (tld) {
    three_level_tlds[tld.toLowerCase()] = 1;
});

config.get('extra-tlds', 'list').forEach(function (tld) {
    var s = tld.split(/\./);
    if (s.length === 2) {
        two_level_tlds[tld.toLowerCase()] = 1;
    } 
    else if (s.length === 3) {
        three_level_tlds[tld.toLowerCase()] = 1;
    }
});

logger.loginfo('[tlds] loaded TLD files:' +
 ' 1=' + Object.keys(top_level_tlds).length +
 ' 2=' + Object.keys(two_level_tlds).length +
 ' 3=' + Object.keys(three_level_tlds).length
);

exports.top_level_tlds = top_level_tlds;
exports.two_level_tlds = two_level_tlds;
exports.three_level_tlds = three_level_tlds;

exports.split_hostname = function(host,level) {
    if (!level || (level && !(level >= 1 && level <= 3))) {
        level = 2;
    }
    var split = host.toLowerCase().split(/\./).reverse();
    var domain = "";
    // TLD
    if (level >= 1 && split[0] && top_level_tlds[split[0]]) {
        domain = split.shift() + domain;
    }
    // 2nd TLD
    if (level >= 2 && split[0] && two_level_tlds[split[0] + '.' + domain]) {
        domain = split.shift() + '.' + domain;
    }
    // 3rd TLD
    if (level >= 3 && split[0] && three_level_tlds[split[0] + '.' + domain]) {
        domain = split.shift() + '.' + domain;
    }
    // Domain
    if (split[0]) {
        domain = split.shift() + '.' + domain;
    }
    return [split.reverse().join('.'), domain];
}

exports.long_to_ip = function (n) {
    var d = n%256;
    for (var i=3; i>0; i--) {
        n = Math.floor(n/256);
        d = n%256 + '.' + d; 
    }
    return d;
}     
      
exports.dec_to_hex = function (d) {
    return d.toString(16);
}     

exports.hex_to_dec = function (h) {
    return parseInt(h, 16);
}

exports.ip_to_long = function (ip) {
    if (!isIPv4(ip)) {
        return false;
    }   
    else {
        var d = ip.split('.');
        return ((((((+d[0])*256)+(+d[1]))*256)+(+d[2]))*256)+(+d[3]);
    }   
}   

exports.is_ip_in_str = function(ip, str) {
    // Only IPv4 for now
    if (isIPv4(ip)) {
        var host_part = (this.split_hostname(str))[0].toLowerCase();
        var ip_split = ip.split('.');
        // 3rd and 4th octets
        if ((host_part.indexOf(ip_split[2]) !== -1) && (host_part.indexOf(ip_split[3]) !== -1)) {
            return true;
        }
        // 1st and 2nd octets
        if ((host_part.indexOf(ip_split[0]) !== -1) && (host_part.indexOf(ip_split[1]) !== -1)) {
            return true;
        }
        var ip_hex = this.dec_to_hex(this.ip_to_long(ip));
        // Whole IP in hex
        if ( (host_part.indexOf(ip_hex[0] + ip_hex[1]) !== -1) &&
             (host_part.indexOf(ip_hex[2] + ip_hex[3]) !== -1) &&
             (host_part.indexOf(ip_hex[4] + ip_hex[5]) !== -1) &&
             (host_part.indexOf(ip_hex[6] + ip_hex[7]) !== -1) )
        {
            return true;
        }
    }
    return false;
}

exports.is_rfc1918 = function (ip) {
    return (isIPv4(ip) && re_private_ipv4.test(ip));
}
