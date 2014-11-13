"use strict";

var logger = require('./logger');
var config = require('./config');
var net    = require('net');
var punycode = require('punycode');

// Regexp to match private IPv4 ranges
var re_private_ipv4 = /^(?:10|127|169\.254|172\.(?:1[6-9]|2[0-9]|3[01])|192\.168)\..*/;

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
    // the domain that was registered with a domain name registrar
    // See https://datatracker.ietf.org/doc/draft-kucherawy-dmarc-base/?include_text=1
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
    if (!net.isIPv4(ip)) {
        return false;
    }
    else {
        var d = ip.split('.');
        return ((((((+d[0])*256)+(+d[1]))*256)+(+d[2]))*256)+(+d[3]);
    }
};

exports.is_ip_in_str = function(ip, str) {
    // Only IPv4 for now
    if (!str) { return false; }
    if (!ip) { return false; }
    if (net.isIPv4(ip)) {
        var oct1, oct2, oct3, oct4;
        var host_part = (this.split_hostname(str,1))[0].toString();
        var ip_split = ip.split('.');
        // See if the 3rd and 4th octets appear in the string
        // We test the largest of the two octets first
        if (ip_split[3].length >= ip_split[2].length) {
            oct4 = host_part.lastIndexOf(ip_split[3]);
            if (oct4 !== -1) {
                oct3 = (host_part.substring(0, oct4) + host_part.substring(oct4 + ip_split[3].length));
                if (oct3.lastIndexOf(ip_split[2]) !== -1) {
                    return true;
                }
            }
        }
        else {
            oct3 = host_part.indexOf(ip_split[2]);
            if (oct3 !== -1) {
                oct4 = (host_part.substring(0, oct3) + host_part.substring(oct3 + ip_split[2].length));
                if (oct4.lastIndexOf(ip_split[3]) !== -1) {
                    return true;
                }
            }
        }
        // 1st and 2nd octets
        if (ip_split[1].length >= ip_split[2].length) {
            oct2 = host_part.lastIndexOf(ip_split[1]);
            if (oct2 !== -1) {
                oct1 = (host_part.substring(0, oct2) + host_part.substring(oct2 + ip_split[1].length));
                if (oct1.lastIndexOf(ip_split[0]) !== -1) {
                    return true;
                }
            }
        }
        else {
            oct1 = host_part.lastIndexOf(ip_split[0]);
            if (oct1 !== -1) {
                oct2 = (host_part.substring(0, oct1) + host_part.substring(oct1 + ip_split[0].length));
                if (oct2.lastIndexOf(ip_split[1]) !== -1) {
                    return true;
                }
            }
        }
        // Whole IP in hex
        var host_part_copy = host_part;
        var ip_hex = this.dec_to_hex(this.ip_to_long(ip));
        for (var i=0; i<4; i++) {
            var part = host_part_copy.indexOf(ip_hex.substring(i*2, (i*2)+2));
            if (part === -1) break;
            if (i === 3) return true;
            host_part_copy = host_part_copy.substring(0, part) + host_part_copy.substring(part+2);
        }
    }
    return false;
};

exports.is_rfc1918 = function (ip) {
    return (net.isIPv4(ip) && re_private_ipv4.test(ip));
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

function load_public_suffix_list() {
    config.get('public-suffix-list','list').forEach(function (entry) {
        // Parsing rules: http://publicsuffix.org/list/
        // Each line is only read up to the first whitespace
        var suffix = entry.split(/\s/).shift().toLowerCase();

        // Each line which is not entirely whitespace or begins with a comment contains a rule.
        if (!suffix) return;                            // empty string
        if ('/' === suffix.substring(0,1)) return;      // comment

        // A rule may begin with a "!" (exclamation mark). If it does, it is
        // labelled as a "exception rule" and then treated as if the exclamation
        // mark is not present.
        if ('!' === suffix.substring(0,1)) {
            var eName = suffix.substring(1);   // remove ! prefix
            var up_one = suffix.split('.').slice(1).join('.'); // bbc.co.uk -> co.uk
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
    if (config.get('smtp.ini').main.public_ip) {
        nu.public_ip = config.get('smtp.ini').public_ip;
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
