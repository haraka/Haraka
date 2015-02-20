require('../configfile').watch_files = false;
var net_utils = require('../net_utils');

function _check(test, ip, host, res) {
    test.expect(1);
    test.equals(net_utils.is_ip_in_str(ip, host), res);
    test.done();
}

exports.static_rdns = {
    '74.125.82.182': function (test) {
        _check(test, '74.125.82.182', 'mail-we0-f182.google.com', false);
    },
    '74.125.82.53': function (test) {
        _check(test, '74.125.82.53', 'mail-ww0-f53.google.com', false);
    }
};

exports.dynamic_rdns = {
    '109.168.232.131': function (test) {
        _check(test, '109.168.232.131', 'host-109-168-232-131.stv.ru', true);
    },
    '62.198.236.129': function (test) {
        _check(test, '62.198.236.129', '0x3ec6ec81.inet.dsl.telianet.dk', true);
    },
    '123.58.178.17': function (test) {
        _check(test, '123.58.178.17', 'm17-178.vip.126.com', true);
    },
    '100.42.67.92': function (test) {
        _check(test, '100.42.67.92', '92-67-42-100-dedicated.multacom.com',
            true);
    },
    '101.0.57.5': function (test) {
        _check(test, '101.0.57.5', 'static-bpipl-101.0.57-5.com', true);
    }
};

function _org_domain(test, actual, expected) {
    test.expect(1);
    test.equals(net_utils.get_organizational_domain(actual), expected);
    test.done();
}

exports.get_organizational_domain = {
    /* jshint -W100 */
    null: function (test) {
        _org_domain(test, null, null);
    },

    // Mixed case.
    COM: function (test) {
        _org_domain(test, 'COM', null);
    },
    'example.COM': function (test) {
        _org_domain(test, 'example.COM', 'example.com');
    },
    'WwW.example.COM': function (test) {
        _org_domain(test, 'WwW.example.COM', 'example.com');
    },

    // Leading dot.
    '.com': function (test) {
        _org_domain(test, '.com', null);
    },
    '.example': function (test) {
        _org_domain(test, '.example', null);
    },
    '.example.com': function (test) {
        _org_domain(test, '.example.com', null);
    },
    '.example.example': function (test) {
        _org_domain(test, '.example.example', null);
    },

    // Unlisted TLD.
    'example': function (test) {
         _org_domain(test, 'example', null);
    },
    'example.example': function (test) {
        _org_domain(test, 'example.example', null);
    },
    // _org_domain(test, 'b.example.example', 'example.example');
    // _org_domain(test, 'a.b.example.example', 'example.example');

    // Listed, but non-Internet, TLD.
    'local': function (test) {
        _org_domain(test, 'local', null);
    },
    'example.local': function (test) {
        _org_domain(test, 'example.local', null);
    },
    'b.example.local': function (test) {
        _org_domain(test, 'b.example.local', null);
    },
    'a.b.example.local': function (test) {
        _org_domain(test, 'a.b.example.local', null);
    },

    // TLD with only 1 rule.
    'biz': function (test) {
        _org_domain(test, 'biz', null);
    },
    'domain.biz': function (test) {
        _org_domain(test, 'domain.biz', 'domain.biz');
    },
    'b.domain.biz': function (test) {
        _org_domain(test, 'b.domain.biz', 'domain.biz');
    },
    'a.b.domain.biz': function (test) {
        _org_domain(test, 'a.b.domain.biz', 'domain.biz');
    },

    'com': function (test) {
        _org_domain(test, 'com', null);
    },
    'example.com': function (test) {
        _org_domain(test, 'example.com', 'example.com');
    },
    'b.example.com': function (test) {
        _org_domain(test, 'b.example.com', 'example.com');
    },
    'a.b.example.com': function (test) {
        _org_domain(test, 'a.b.example.com', 'example.com');
    },
    'uk.com': function (test) {
        _org_domain(test, 'uk.com', null);
    },
    'example.uk.com': function (test) {
        _org_domain(test, 'example.uk.com', 'example.uk.com');
    },
    'b.example.uk.com': function (test) {
        _org_domain(test, 'b.example.uk.com', 'example.uk.com');
    },
    'a.b.example.uk.com': function (test) {
        _org_domain(test, 'a.b.example.uk.com', 'example.uk.com');
    },
    'test.ac': function (test) {
        _org_domain(test, 'test.ac', 'test.ac');
    },

    // TLD with some 2-level rules.
    // TLD with only 1 (wildcard) rule.
    'cy': function (test) {
        _org_domain(test, 'cy', null);
    },
    'c.cy': function (test) {
        _org_domain(test, 'c.cy', null);
    },
    'b.c.cy': function (test) {
        _org_domain(test, 'b.c.cy', 'b.c.cy');
    },
    'a.b.c.cy': function (test) {
        _org_domain(test, 'a.b.c.cy', 'b.c.cy');
    },

    // More complex TLD.
    'jp': function (test) {
        _org_domain(test, 'jp', null);
    },
    'test.jp': function (test) {
        _org_domain(test, 'test.jp', 'test.jp');
    },
    'www.test.jp': function (test) {
        _org_domain(test, 'www.test.jp', 'test.jp');
    },
    'ac.jp': function (test) {
        _org_domain(test, 'ac.jp', null);
    },
    'test.ac.jp': function (test) {
        _org_domain(test, 'test.ac.jp', 'test.ac.jp');
    },
    'www.test.ac.jp': function (test) {
        _org_domain(test, 'www.test.ac.jp', 'test.ac.jp');
    },
    'kyoto.jp': function (test) {
        _org_domain(test, 'kyoto.jp', null);
    },
    'test.kyoto.jp': function (test) {
        _org_domain(test, 'test.kyoto.jp', 'test.kyoto.jp');
    },
    'ide.kyoto.jp': function (test) {
        _org_domain(test, 'ide.kyoto.jp', null);
    },
    'b.ide.kyoto.jp': function (test) {
        _org_domain(test, 'b.ide.kyoto.jp', 'b.ide.kyoto.jp');
    },
    'a.b.ide.kyoto.jp': function (test) {
        _org_domain(test, 'a.b.ide.kyoto.jp', 'b.ide.kyoto.jp');
    },
    'c.kobe.jp': function (test) {
        _org_domain(test, 'c.kobe.jp', null);
    },
    'b.c.kobe.jp': function (test) {
        _org_domain(test, 'b.c.kobe.jp', 'b.c.kobe.jp');
    },
    'a.b.c.kobe.jp': function (test) {
        _org_domain(test, 'a.b.c.kobe.jp', 'b.c.kobe.jp');
    },
    'city.kobe.jp': function (test) {
        _org_domain(test, 'city.kobe.jp', 'city.kobe.jp');
    },
    'www.city.kobe.jp': function (test) {
        _org_domain(test, 'www.city.kobe.jp', 'city.kobe.jp');
    },

    // TLD with a wildcard rule and exceptions.
    'ck': function (test) {
        _org_domain(test, 'ck', null);
    },
    'test.ck': function (test) {
        _org_domain(test, 'test.ck', null);
    },
    'b.test.ck': function (test) {
        _org_domain(test, 'b.test.ck', 'b.test.ck');
    },
    'a.b.test.ck': function (test) {
        _org_domain(test, 'a.b.test.ck', 'b.test.ck');
    },
    'www.ck': function (test) {
        _org_domain(test, 'www.ck', 'www.ck');
    },
    'www.www.ck': function (test) {
        _org_domain(test, 'www.www.ck', 'www.ck');
    },
    // US K12.
    'us': function (test) {
        _org_domain(test, 'us', null);
    },
    'test.us': function (test) {
        _org_domain(test, 'test.us', 'test.us');
    },
    'www.test.us': function (test) {
        _org_domain(test, 'www.test.us', 'test.us');
    },
    'ak.us': function (test) {
        _org_domain(test, 'ak.us', null);
    },
    'test.ak.us': function (test) {
        _org_domain(test, 'test.ak.us', 'test.ak.us');
    },
    'www.test.ak.us': function (test) {
        _org_domain(test, 'www.test.ak.us', 'test.ak.us');
    },
    'k12.ak.us': function (test) {
        _org_domain(test, 'k12.ak.us', null);
    },
    'test.k12.ak.us': function (test) {
        _org_domain(test, 'test.k12.ak.us', 'test.k12.ak.us');
    },
    'www.test.k12.ak.us': function (test) {
        _org_domain(test, 'www.test.k12.ak.us', 'test.k12.ak.us');
    },
    // IDN labels.
    '食狮.com.cn': function (test) {
        _org_domain(test, '食狮.com.cn', '食狮.com.cn');
    },
    '食狮.公司.cn': function (test) {
        _org_domain(test, '食狮.公司.cn', '食狮.公司.cn');
    },
    'www.食狮.公司.cn': function (test) {
        _org_domain(test, 'www.食狮.公司.cn', '食狮.公司.cn');
    },
    'shishi.公司.cn': function (test) {
        _org_domain(test, 'shishi.公司.cn', 'shishi.公司.cn');
    },
    '公司.cn': function (test) {
        _org_domain(test, '公司.cn', null);
    },
    '食狮.中国': function (test) {
        _org_domain(test, '食狮.中国', '食狮.中国');
    },
    'www.食狮.中�': function (test) {
        _org_domain(test, 'www.食狮.中国', '食狮.中国');
    },
    'shishi.中国': function (test) {
        _org_domain(test, 'shishi.中国', 'shishi.中国');
    },
    '中国': function (test) {
        _org_domain(test, '中国', null);
    },
    // Same as above, but punycoded.
    'xn--85x722f.com.cn': function (test) {
        _org_domain(test, 'xn--85x722f.com.cn', 'xn--85x722f.com.cn');
    },
    'xn--85x722f.xn--55qx5d.cn': function (test) {
        _org_domain(test, 'xn--85x722f.xn--55qx5d.cn',
            'xn--85x722f.xn--55qx5d.cn');
    },
    'www.xn--85x722f.xn--55qx5d.cn': function (test) {
        _org_domain(test, 'www.xn--85x722f.xn--55qx5d.cn',
            'xn--85x722f.xn--55qx5d.cn');
    },
    'shishi.xn--55qx5d.cn': function (test) {
        _org_domain(test, 'shishi.xn--55qx5d.cn', 'shishi.xn--55qx5d.cn');
    },
    'xn--55qx5d.cn': function (test) {
        _org_domain(test, 'xn--55qx5d.cn', null);
    },
/* 
    'xn--85x722f.xn--fiqs8s': function (test) {
        _org_domain(test, 'xn--85x722f.xn--fiqs8s', 'xn--85x722f.xn--fiqs8s');
    },
    'www.xn--85x722f.xn--fiqs8s': function (test) {
        _org_domain(test, 'www.xn--85x722f.xn--fiqs8s',
            'xn--85x722f.xn--fiqs8s');
    },
    'shishi.xn--fiqs8s': function (test) {
        _org_domain(test, 'shishi.xn--fiqs8s', 'shishi.xn--fiqs8s');
    },
*/
    'xn--fiqs8s': function (test) {
        _org_domain(test, 'xn--fiqs8s', null);
    },
};

function _same_ipv4_network(test, addr, addrList, expected) {
    test.expect(1);
    test.equals(expected, net_utils.same_ipv4_network(addr, addrList));
    test.done();
}

exports.same_ipv4_network = {
    '199.176.179.3 <-> [199.176.179.4]': function (test) {
        _same_ipv4_network(test, '199.176.179.3', ['199.176.179.4'], true);
    },
    '199.176.179.3 <-> [199.177.179.4': function (test) {
        _same_ipv4_network(test, '199.176.179.3', ['199.177.179.4'], false);
    },

    '199.176.179 <-> [199.176.179.4] (missing octet)': function (test) {
        _same_ipv4_network(test, '199.176.179', ['199.176.179.4'], false);
    },
    '199.176.179.3.5 <-> [199.176.179.4] (extra octet)': function (test) {
        _same_ipv4_network(test, '199.176.179.3.5', ['199.176.179.4'], false);
    },
};

function _is_public_suffix(test, label, expected) {
    test.expect(1);
    test.equals(expected, net_utils.is_public_suffix(label));
    test.done();
}

exports.is_public_suffix = {
    'com': function (test) {
        _is_public_suffix(test, 'com', true);
    },
    'COM (uc)': function (test) {
        _is_public_suffix(test, 'COM', true);
    },
    'net': function (test) {
        _is_public_suffix(test, 'net', true);
    },
    'co.uk': function (test) {
        _is_public_suffix(test, 'co.uk', true);
    },
    'org': function (test) {
        _is_public_suffix(test, 'org', true);
    },
    'edu': function (test) {
        _is_public_suffix(test, 'edu', true);
    },
    'gov': function (test) {
        _is_public_suffix(test, 'gov', true);
    },
};

exports.is_ipv4_literal = {
    '3 ways ': function (test) {
        test.expect(3);
        test.equal(true,  net_utils.is_ipv4_literal('[127.0.0.1]'));
        test.equal(false, net_utils.is_ipv4_literal('127.0.0.1'));
        test.equal(false, net_utils.is_ipv4_literal('test.host'));
        test.done();
    },
};

function _is_private_ip(test, ip, expected) {
    test.expect(1);
    test.equals(expected, net_utils.is_private_ip(ip));
    test.done();
}

exports.is_private_ip = {
    '127.0.0.1': function (test) {
        _is_private_ip(test, '127.0.0.1', true);
    },
    '10.255.31.23': function (test) {
        _is_private_ip(test, '10.255.31.23', true);
    },
    '172.16.255.254': function (test) {
        _is_private_ip(test, '172.16.255.254', true);
    },
    '192.168.123.123': function (test) {
        _is_private_ip(test, '192.168.123.123', true);
    },
    '169.254.23.54 (APIPA)': function (test) {
        _is_private_ip(test, '169.254.23.54', true);
    },
    '::1': function (test) {
        _is_private_ip(test, '::1', true);
    },
    '0:0:0:0:0:0:0:1': function (test) {
        _is_private_ip(test, '0:0:0:0:0:0:0:1', true);
    },
    '0000:0000:0000:0000:0000:0000:0000:0001': function (test) {
        _is_private_ip(test, '0000:0000:0000:0000:0000:0000:0000:0001', true);
    },
    '123.123.123.123': function (test) {
        _is_private_ip(test, '123.123.123.123', false);
    },
    'dead::beef': function (test) {
        _is_private_ip(test, 'dead::beef', false);
    },
    '192.168.1 (missing octet)': function (test) {
        _is_private_ip(test, '192.168.1', false);
    },
    '239.0.0.1 (multicast; not currently considered rfc1918)': function (test) {
        _is_private_ip(test, '239.0.0.1', false);
    },
};

exports.get_public_ip = {
    setUp: function (callback) {
        this.net_utils = require("../net_utils");
        callback();
    },
    'cached': function (test) {
        test.expect(2);
        this.net_utils.public_ip='1.1.1.1';
        var cb = function (err, ip) {
            test.equal(null, err);
            test.equal('1.1.1.1', ip);
            test.done();
        };
        this.net_utils.get_public_ip(cb);
    },
    'normal': function (test) {
        this.net_utils.public_ip=undefined;
        var cb = function (err, ip) {
            // console.log('ip: ' + ip);
            // console.log('err: ' + err);
            if (has_stun()) {
                if (err) {
                    console.log(err);
                    test.expect(0);
                }
                else {
                    console.log("stun success: " + ip);
                    test.expect(2);
                    test.equal(null, err);
                    test.ok(ip, ip);
                }
            }
            else {
                console.log("stun skipped");
                test.expect(0);
            }
            test.done();
        };
        this.net_utils.get_public_ip(cb);
    },
};

function has_stun () {
    try {
        require('vs-stun');
    }
    catch (e) {
        return false;
    }
    return true;
}

exports.octets_in_string = {
    'c-24-18-98-14.hsd1.wa.comcast.net': function (test) {
        var str = 'c-24-18-98-14.hsd1.wa.comcast.net';
        test.expect(3);
        test.equal(net_utils.octets_in_string(str, 98, 14), true );
        test.equal(net_utils.octets_in_string(str, 24, 18), true );
        test.equal(net_utils.octets_in_string(str, 2, 7), false );
        test.done();
    },
    '149.213.210.203.in-addr.arpa': function (test) {
        var str = '149.213.210.203.in-addr.arpa';
        test.expect(3);
        test.equal(net_utils.octets_in_string(str, 149, 213), true );
        test.equal(net_utils.octets_in_string(str, 210, 20), true );
        test.equal(net_utils.octets_in_string(str, 2, 7), false );
        test.done();
    }
};

exports.is_local_ipv4 = {
    '127/8': function (test) {
        test.expect(3);
        test.equal(net_utils.is_local_ipv4('127.0.0.0'), true);
        test.equal(net_utils.is_local_ipv4('127.0.0.1'), true);
        test.equal(net_utils.is_local_ipv4('127.1.0.255'), true);

        test.done();
    },
    '0/8': function (test) {
        test.expect(4);
        test.equal(net_utils.is_local_ipv4('0.0.0.1'), false);
        test.equal(net_utils.is_local_ipv4('0.255.0.1'), false);
        test.equal(net_utils.is_local_ipv4('1.255.0.1'), false);
        test.equal(net_utils.is_local_ipv4('10.255.0.1'), false);
        test.done();
    },
};

exports.is_private_ipv4 = {
    '10/8': function (test) {
        test.expect(4);
        test.equal(net_utils.is_private_ipv4('10.0.0.0'), true);
        test.equal(net_utils.is_private_ipv4('10.255.0.0'), true);
        test.equal(net_utils.is_private_ipv4('9.255.0.0'), false);
        test.equal(net_utils.is_private_ipv4('11.255.0.0'), false);
        test.done();
    },
    '192.168/16': function (test) {
        test.expect(3);
        test.equal(net_utils.is_private_ipv4('192.168.0.0'), true);
        test.equal(net_utils.is_private_ipv4('192.169.0.0'), false);
        test.equal(net_utils.is_private_ipv4('192.167.0.0'), false);
        test.done();
    },
    '172.16-31': function (test) {
        test.expect(5);
        test.equal(net_utils.is_private_ipv4('172.16.0.0'), true);
        test.equal(net_utils.is_private_ipv4('172.20.0.0'), true);
        test.equal(net_utils.is_private_ipv4('172.31.0.0'), true);
        test.equal(net_utils.is_private_ipv4('172.15.0.0'), false);
        test.equal(net_utils.is_private_ipv4('172.32.0.0'), false);
        test.done();
    },
};

exports.is_local_ipv6 = {
    '::1': function (test) {
        test.expect(3);
        test.equal(net_utils.is_local_ipv6('::1'), true);
        test.equal(net_utils.is_local_ipv6('0:0:0:0:0:0:0:1'), true);
        test.equal(net_utils.is_local_ipv6(
            '0000:0000:0000:0000:0000:0000:0000:0001'), true);
        test.done();
    },
    'fe80::/10': function (test) {
        test.expect(4);
        test.equal(net_utils.is_local_ipv6('fe80::'), true);
        test.equal(net_utils.is_local_ipv6('fe80:'), false);
        test.equal(net_utils.is_local_ipv6('fe8:'), false);
        test.equal(net_utils.is_local_ipv6(':fe80:'), false);
        test.done();
    },
    'fc80::/7': function (test) {
        test.expect(10);
        test.equal(net_utils.is_local_ipv6('fc00:'), true);
        test.equal(net_utils.is_local_ipv6('fcff:'), true);

        // examples from https://en.wikipedia.org/wiki/Unique_local_address
        test.equal(net_utils.is_local_ipv6('fde4:8dba:82e1::'), true);
        test.equal(net_utils.is_local_ipv6('fde4:8dba:82e1:ffff::'), true);

        test.equal(net_utils.is_local_ipv6('fd00:'), true);
        test.equal(net_utils.is_local_ipv6('fdff:'), true);

        test.equal(net_utils.is_local_ipv6('fb00:'), false);
        test.equal(net_utils.is_local_ipv6('fe00:'), false);

        test.equal(net_utils.is_local_ipv6('fe8:'), false);
        test.equal(net_utils.is_local_ipv6(':fe80:'), false);
        test.done();
    },
};
