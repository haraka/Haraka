'use strict';

// node.js built-ins
var dns    = require('dns');
var net    = require('net');

// haraka libraries
var logger = require('./logger');
var config = require('./config');

// npm modules
var async    = require('async');
var ipaddr    = require('ipaddr.js');
var sprintf   = require('sprintf-js').sprintf;
var tlds      = require('haraka-tld');

exports.long_to_ip = function (n) {
    var d = n%256;
    for (var i=3; i>0; i--) {
        n = Math.floor(n/256);
        d = n%256 + '.' + d;
    }
    return d;
};

exports.dec_to_hex = function (d) {
    return d.toString(16);
};

exports.hex_to_dec = function (h) {
    return parseInt(h, 16);
};

exports.ip_to_long = function (ip) {
    if (!net.isIPv4(ip)) { return false; }

    var d = ip.split('.');
    return ((((((+d[0])*256)+(+d[1]))*256)+(+d[2]))*256)+(+d[3]);
};

exports.octets_in_string = function (str, oct1, oct2) {
    var oct1_idx;
    var oct2_idx;

    // test the largest of the two octets first
    if (oct2.length >= oct1.length) {
        oct2_idx = str.lastIndexOf(oct2);
        if (oct2_idx === -1) { return false; }

        oct1_idx = (str.substring(0, oct2_idx) +
            str.substring(oct2_idx + oct2.length)).lastIndexOf(oct1);
        if (oct1_idx === -1) { return false; }

        return true;  // both were found
    }

    oct1_idx = str.indexOf(oct1);
    if (oct1_idx === -1) { return false; }

    oct2_idx = (str.substring(0, oct1_idx) +
        str.substring(oct1_idx + oct1.length)).lastIndexOf(oct2);
    if (oct2_idx === -1) { return false; }

    return true;
};

exports.is_ip_in_str = function (ip, str) {
    if (!str) { return false; }
    if (!ip) { return false; }
    if (!net.isIPv4(ip)) {
        return false;   // IPv4 only, for now
    }

    var host_part = (tlds.split_hostname(str,1))[0].toString();
    var octets = ip.split('.');
    // See if the 3rd and 4th octets appear in the string
    if (this.octets_in_string(host_part, octets[2], octets[3])) {
        return true;
    }
    // then the 1st and 2nd octets
    if (this.octets_in_string(host_part, octets[0], octets[1])) {
        return true;
    }

    // Whole IP in hex
    var host_part_copy = host_part;
    var ip_hex = this.dec_to_hex(this.ip_to_long(ip));
    for (var i=0; i<4; i++) {
        var part = host_part_copy.indexOf(ip_hex.substring(i*2, (i*2)+2));
        if (part === -1) break;
        if (i === 3) return true;
        host_part_copy = host_part_copy.substring(0, part) +
            host_part_copy.substring(part+2);
    }
    return false;
};

var re_ipv4 = {
    loopback: /^127\./,
    link_local: /^169\.254\./,

    private10: /^10\./,          // 10/8
    private192: /^192\.168\./,   // 192.168/16
    // 172.16/16 .. 172.31/16
    private172: /^172\.(1[6-9]|2[0-9]|3[01])\./,  // 172.16/12
};

exports.is_private_ipv4 = function (ip) {

    // RFC 1918, reserved as "private" IP space
    if (re_ipv4.private10.test(ip)) return true;
    if (re_ipv4.private192.test(ip)) return true;
    if (re_ipv4.private172.test(ip)) return true;

    return false;
};

exports.is_local_ipv4 = function (ip) {
    // 127/8 (loopback)   # RFC 1122
    if (re_ipv4.loopback.test(ip)) return true;

    // link local: 169.254/16) RFC 3927
    if (re_ipv4.link_local.test(ip)) return true;

    return false;
};

var re_ipv6 = {
    loopback:     /^(0{1,4}:){7}0{0,3}1$/,
    link_local:   /^fe80::/i,
    unique_local: /^f(c|d)[a-f0-9]{2}:/i,
};

exports.is_local_ipv6 = function (ip) {
    if (ip === '::1') return true;   // RFC 4291

    // 2 more IPv6 notations for ::1
    // 0:0:0:0:0:0:0:1 or 0000:0000:0000:0000:0000:0000:0000:0001
    if (re_ipv6.loopback.test(ip)) return true;

    // link local: fe80::/10, RFC 4862
    if (re_ipv6.link_local.test(ip)) return true;

    // unique local (fc00::/7)   -> fc00: - fd00:
    if (re_ipv6.unique_local.test(ip)) return true;

    return false;
};

exports.is_private_ip = function (ip) {
    if (net.isIPv4(ip)) {
        if (this.is_private_ipv4(ip)) return true;
        if (this.is_local_ipv4(ip)) return true;
        return false;
    }

    if (net.isIPv6(ip)) {
        if (this.is_local_ipv6(ip)) return true;
        return false;
    }

    logger.logerror('invalid IP address: ' + ip);
    return false;
};

// backwards compatibility for non-public modules. Sunset: v3.0
exports.is_rfc1918 = exports.is_private_ip;

exports.is_ip_literal = function (host) {
    return exports.get_ipany_re('^\\[','\\]$','').test(host) ? true : false;
};

exports.is_ipv4_literal = function (host) {
    return /^\[(\d{1,3}\.){3}\d{1,3}\]$/.test(host) ? true : false;
};

exports.same_ipv4_network = function (ip, ipList) {
    if (!ipList || !ipList.length) {
        logger.logerror('same_ipv4_network, no ip list!');
        return false;
    }
    if (!net.isIPv4(ip)) {
        logger.logerror('same_ipv4_network, IP is not IPv4!');
        return false;
    }

    var first3 = ip.split('.').slice(0,3).join('.');

    for (var i=0; i < ipList.length; i++) {
        if (!net.isIPv4(ipList[i])) {
            logger.logerror('same_ipv4_network, IP in list is not IPv4!');
            continue;
        }
        if (first3 === ipList[i].split('.').slice(0,3).join('.'))
            return true;
    }
    return false;
};

exports.get_public_ip = function (cb) {
    var nu = this;
    if (nu.public_ip !== undefined) {
        return cb(null, nu.public_ip);  // cache
    }

    // manual config override, for the cases where we can't figure it out
    var smtpIni = config.get('smtp.ini').main;
    if (smtpIni.public_ip) {
        nu.public_ip = smtpIni.public_ip;
        return cb(null, nu.public_ip);
    }

    // Initialise cache value to null to prevent running
    // should we hit a timeout or the module isn't installed.
    nu.public_ip = null;

    try {
        nu.stun = require('vs-stun');
    }
    catch (e) {
        e.install = 'Please install stun: "npm install -g vs-stun"';
        logger.logerror(e.msg + "\n" + e.install);
        return cb(e);
    }

    var timeout = 10;
    var timer;

    var st_cb = function (error, socket) {
        if (timer) clearTimeout(timer);
        if (error) {
            return cb(error);
        }
        socket.close();
        /*          sample socket.stun response
         *
         *  { local: { host: '127.0.0.30', port: 26163 },
         *  public: { host: '50.115.0.94', port: 57345, family: 'IPv4' },
         *  type: 'Full Cone NAT'
         *  }
        */
        if (!socket.stun.public) {
            return cb(new Error('invalid STUN result'));
        }
        nu.public_ip = socket.stun.public.host;
        return cb(null, socket.stun.public.host);
    };

    // Connect to STUN Server
    nu.stun.connect({ host: get_stun_server(), port: 19302 }, st_cb);

    timer = setTimeout(function () {
        return cb(new Error('STUN timeout'));
    }, (timeout || 10) * 1000);
};

function get_stun_server () {
    // STUN servers by Google
    var servers = [
        'stun.l.google.com',
        'stun1.l.google.com',
        'stun2.l.google.com',
        'stun3.l.google.com',
        'stun4.l.google.com',
    ];
    return servers[Math.floor(Math.random()*servers.length)];
}

exports.get_ipany_re = function (prefix, suffix, modifier) {
    /* jshint maxlen: false */
    if (prefix === undefined) prefix = '';
    if (suffix === undefined) suffix = '';
    if (modifier === undefined) modifier = 'mg';
    return new RegExp(
        prefix +
        '(' +    // capture group
        '(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\\.(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\\.(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\\.(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?))|(?:(?:(?:(?:(?:(?:(?:[0-9a-fA-F]{1,4})):){6})(?:(?:(?:(?:(?:[0-9a-fA-F]{1,4})):(?:(?:[0-9a-fA-F]{1,4})))|(?:(?:(?:(?:(?:25[0-5]|(?:[1-9]|1[0-9]|2[0-4])?[0-9]))\\.){3}(?:(?:25[0-5]|(?:[1-9]|1[0-9]|2[0-4])?[0-9])))))))|(?:(?:::(?:(?:(?:[0-9a-fA-F]{1,4})):){5})(?:(?:(?:(?:(?:[0-9a-fA-F]{1,4})):(?:(?:[0-9a-fA-F]{1,4})))|(?:(?:(?:(?:(?:25[0-5]|(?:[1-9]|1[0-9]|2[0-4])?[0-9]))\\.){3}(?:(?:25[0-5]|(?:[1-9]|1[0-9]|2[0-4])?[0-9])))))))|(?:(?:(?:(?:(?:[0-9a-fA-F]{1,4})))?::(?:(?:(?:[0-9a-fA-F]{1,4})):){4})(?:(?:(?:(?:(?:[0-9a-fA-F]{1,4})):(?:(?:[0-9a-fA-F]{1,4})))|(?:(?:(?:(?:(?:25[0-5]|(?:[1-9]|1[0-9]|2[0-4])?[0-9]))\\.){3}(?:(?:25[0-5]|(?:[1-9]|1[0-9]|2[0-4])?[0-9])))))))|(?:(?:(?:(?:(?:(?:[0-9a-fA-F]{1,4})):){0,1}(?:(?:[0-9a-fA-F]{1,4})))?::(?:(?:(?:[0-9a-fA-F]{1,4})):){3})(?:(?:(?:(?:(?:[0-9a-fA-F]{1,4})):(?:(?:[0-9a-fA-F]{1,4})))|(?:(?:(?:(?:(?:25[0-5]|(?:[1-9]|1[0-9]|2[0-4])?[0-9]))\\.){3}(?:(?:25[0-5]|(?:[1-9]|1[0-9]|2[0-4])?[0-9])))))))|(?:(?:(?:(?:(?:(?:[0-9a-fA-F]{1,4})):){0,2}(?:(?:[0-9a-fA-F]{1,4})))?::(?:(?:(?:[0-9a-fA-F]{1,4})):){2})(?:(?:(?:(?:(?:[0-9a-fA-F]{1,4})):(?:(?:[0-9a-fA-F]{1,4})))|(?:(?:(?:(?:(?:25[0-5]|(?:[1-9]|1[0-9]|2[0-4])?[0-9]))\\.){3}(?:(?:25[0-5]|(?:[1-9]|1[0-9]|2[0-4])?[0-9])))))))|(?:(?:(?:(?:(?:(?:[0-9a-fA-F]{1,4})):){0,3}(?:(?:[0-9a-fA-F]{1,4})))?::(?:(?:[0-9a-fA-F]{1,4})):)(?:(?:(?:(?:(?:[0-9a-fA-F]{1,4})):(?:(?:[0-9a-fA-F]{1,4})))|(?:(?:(?:(?:(?:25[0-5]|(?:[1-9]|1[0-9]|2[0-4])?[0-9]))\\.){3}(?:(?:25[0-5]|(?:[1-9]|1[0-9]|2[0-4])?[0-9])))))))|(?:(?:(?:(?:(?:(?:[0-9a-fA-F]{1,4})):){0,4}(?:(?:[0-9a-fA-F]{1,4})))?::)(?:(?:(?:(?:(?:[0-9a-fA-F]{1,4})):(?:(?:[0-9a-fA-F]{1,4})))|(?:(?:(?:(?:(?:25[0-5]|(?:[1-9]|1[0-9]|2[0-4])?[0-9]))\\.){3}(?:(?:25[0-5]|(?:[1-9]|1[0-9]|2[0-4])?[0-9])))))))|(?:(?:(?:(?:(?:(?:[0-9a-fA-F]{1,4})):){0,5}(?:(?:[0-9a-fA-F]{1,4})))?::)(?:(?:[0-9a-fA-F]{1,4})))|(?:(?:(?:(?:(?:(?:[0-9a-fA-F]{1,4})):){0,6}(?:(?:[0-9a-fA-F]{1,4})))?::))))' + // complex ipv4 + ipv6
        ')' +    // end capture
        suffix,
        modifier
    );
};

exports.get_ips_by_host = function (hostname, done) {
    var ips = [];
    var errors = [];

    async.parallel(
        [
            function (iter_done) {
                dns.resolve4(hostname, function resolve_cb (err, res) {
                    if (err) {
                        errors.push(err);
                        return iter_done();
                    }
                    for (var i=0; i<res.length; i++) {
                        ips.push(res[i]);
                    }
                    iter_done(null, true);
                });
            },
            function (iter_done) {
                dns.resolve6(hostname, function resolve_cb (err, res) {
                    if (err) {
                        errors.push(err);
                        return iter_done();
                    }
                    for (var j=0; j<res.length; j++) {
                        ips.push(res[j]);
                    }
                    iter_done(null, true);
                });
            },
        ],
        function (err, async_list) {
            // if multiple IPs are included in the iterations, then the async
            // result here will be an array of nested arrays. Not quite what
            // we want. Return the merged ips array.
            done(errors, ips);
        }
    );
};

exports.ipv6_reverse = function(ipv6){
    var ipv6 = ipaddr.parse(ipv6);
    return ipv6.toNormalizedString()
        .split(':')
        .map(function (n) {
            return sprintf('%04x', parseInt(n, 16));
        })
        .join('')
        .split('')
        .reverse()
        .join('.');
};

exports.ipv6_bogus = function(ipv6){
    var ipCheck = ipaddr.parse(ipv6);
    if (ipCheck.range() !== 'unicast') { return true; }
    return false;
};
