'use strict';

var logger = require('./logger');
var config = require('./config');
var net    = require('net');
var punycode = require('punycode');

var public_suffix_list = {};
load_public_suffix_list();

exports.is_public_suffix = function (host) {
    if (!host) return false;
    host = host.toLowerCase();
    if (public_suffix_list[host]) return true;

    var up_one_level = host.split('.').slice(1).join('.'); // co.uk -> uk
    if (!up_one_level) return false;   // no dot?

    var wildHost = '*.' + up_one_level;
    if (public_suffix_list[wildHost]) {
        if (public_suffix_list['!'+host]) return false; // on exception list
        return true;           // matched a wildcard, ex: *.uk
    }

    var puny;
    try { puny = punycode.toUnicode(host); }
    catch(e) {}
    if (puny && public_suffix_list[puny]) return true;

    return false;
};

exports.get_organizational_domain = function (host) {
    // the domain that was registered with a domain name registrar. See
    // https://datatracker.ietf.org/doc/draft-kucherawy-dmarc-base/?include_text=1
    //   section 3.2

    if (!host) return null;
    host = host.toLowerCase();

    // www.example.com -> [ com, example, www ]
    var labels = host.split('.').reverse();

    // 4.3 Search the public suffix list for the name that matches the
    //     largest number of labels found in the subject DNS domain.
    var greatest = 0;
    for (var i = 1; i <= labels.length; i++) {
        if (!labels[i-1]) return null;                   // dot w/o label
        var tld = labels.slice(0,i).reverse().join('.');
        if (this.is_public_suffix(tld)) {
            greatest = +(i + 1);
        }
        else if (public_suffix_list['!'+tld]) {
            greatest = i;
        }
    }

    // 4.4 Construct a new DNS domain name using the name that matched
    //     from the public suffix list and prefixing to it the "x+1"th
    //     label from the subject domain.
    if (greatest === 0) return null;             // no valid TLD
    if (greatest  >  labels.length) return null; // not enough labels
    if (greatest === labels.length) return host; // same

    var orgName = labels.slice(0,greatest).reverse().join('.');
    return orgName;
};

var top_level_tlds = {};
var two_level_tlds = {};
var three_level_tlds = {};
load_tld_files();

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
};

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
    var oct1_idx, oct2_idx;

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

exports.is_ip_in_str = function(ip, str) {
    if (!str) { return false; }
    if (!ip) { return false; }
    if (!net.isIPv4(ip)) {
        return false;   // IPv4 only, for now
    }

    var host_part = (this.split_hostname(str,1))[0].toString();
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

function load_public_suffix_list() {
    config.get('public-suffix-list','list').forEach(function (entry) {
        // Parsing rules: http://publicsuffix.org/list/
        // Each line is only read up to the first whitespace
        var suffix = entry.split(/\s/).shift().toLowerCase();

        // Each line which is not entirely whitespace or begins with a comment
        // contains a rule.
        if (!suffix) return;                            // empty string
        if ('/' === suffix.substring(0,1)) return;      // comment

        // A rule may begin with a "!" (exclamation mark). If it does, it is
        // labelled as a "exception rule" and then treated as if the exclamation
        // mark is not present.
        if ('!' === suffix.substring(0,1)) {
            var eName = suffix.substring(1);   // remove ! prefix
            // bbc.co.uk -> co.uk
            var up_one = suffix.split('.').slice(1).join('.');
            if (public_suffix_list[up_one]) {
                public_suffix_list[up_one].push(eName);
            }
            else if (public_suffix_list['*.'+up_one]) {
                public_suffix_list['*.'+up_one].push(eName);
            }
            else {
                logger.logerror("unable to find parent for exception: "+eName);
            }
        }

        public_suffix_list[suffix] = [];
    });
    var entries = Object.keys(public_suffix_list).length;
    logger.loginfo('loaded '+ entries +' Public Suffixes');
}

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

function load_tld_files () {
    config.get('top-level-tlds','list').forEach(function (tld) {
        top_level_tlds[tld.toLowerCase()] = 1;
    });

    config.get('two-level-tlds', 'list').forEach(function (tld) {
        two_level_tlds[tld.toLowerCase()] = 1;
    });

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

    logger.loginfo('loaded TLD files:' +
    ' 1=' + Object.keys(top_level_tlds).length +
    ' 2=' + Object.keys(two_level_tlds).length +
    ' 3=' + Object.keys(three_level_tlds).length
    );
}

exports.get_public_ip = function (cb) {
    var nu = this;
    if (nu.public_ip) {
        return cb(null, nu.public_ip);  // cache
    }

    // manual config override, for the cases where we can't figure it out
    var smtpIni = config.get('smtp.ini').main;
    if (smtpIni.public_ip) {
        nu.public_ip = smtpIni.public_ip;
        return cb(null, nu.public_ip);
    }

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
