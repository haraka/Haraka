require('../configfile').watch_files = false;
var net_utils = require('../net_utils');
var net = require('net');

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
        _org_domain(test, 'b.c.cy', null);
    },
    'a.b.c.cy': function (test) {
        _org_domain(test, 'a.b.c.cy', null);
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

exports.is_ip_literal = {
    'ipv4 is_ip_literal': function (test) {
        test.expect(6);
        test.equal(net_utils.is_ip_literal('[127.0.0.0]'), true);
        test.equal(net_utils.is_ip_literal('[127.0.0.1]'), true);
        test.equal(net_utils.is_ip_literal('[127.1.0.255]'), true);
        test.equal(net_utils.is_ip_literal('127.0.0.0'), false);
        test.equal(net_utils.is_ip_literal('127.0.0.1'), false);
        test.equal(net_utils.is_ip_literal('127.1.0.255'), false);

        test.done();
    },
    'ipv6 is_ip_literal': function (test) {
        test.expect(6);
        test.equal(net_utils.is_ip_literal('[::5555:6666:7777:8888]'), true);
        test.equal(net_utils.is_ip_literal('[1111::4444:5555:6666:7777:8888]'), true);
        test.equal(net_utils.is_ip_literal('[2001:0:1234::C1C0:ABCD:876]'), true);
        test.equal(net_utils.is_ip_literal('::5555:6666:7777:8888'), false);
        test.equal(net_utils.is_ip_literal('1111::4444:5555:6666:7777:8888'), false);
        test.equal(net_utils.is_ip_literal('2001:0:1234::C1C0:ABCD:876'), false);

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

var ip_fixtures = [
    [false , " 2001:0000:1234:0000:0000:C1C0:ABCD:0876  "],
    [false , " 2001:0000:1234:0000:0000:C1C0:ABCD:0876  0"],
    [false , " 2001:0000:1234:0000:0000:C1C0:ABCD:0876"],
    [false , " 2001:0:1234::C1C0:ABCD:876  "],
    [false , " 2001:0:1234::C1C0:ABCD:876"],
    [false , ""],
    [false , "':10.0.0.1"],
    [false , "---"],
    [false , "02001:0000:1234:0000:0000:C1C0:ABCD:0876"],
    [false , "1.2.3.4:1111:2222:3333:4444::5555"],
    [false , "1.2.3.4:1111:2222:3333::5555"],
    [false , "1.2.3.4:1111:2222::5555"],
    [false , "1.2.3.4:1111::5555"],
    [false , "1.2.3.4::"],
    [false , "1.2.3.4::5555"],
    [false , "1111"],
    [false , "11112222:3333:4444:5555:6666:1.2.3.4"],
    [false , "11112222:3333:4444:5555:6666:7777:8888"],
    [false , "1111:"],
    [false , "1111:1.2.3.4"],
    [false , "1111:2222"],
    [false , "1111:22223333:4444:5555:6666:1.2.3.4"],
    [false , "1111:22223333:4444:5555:6666:7777:8888"],
    [false , "1111:2222:"],
    [false , "1111:2222:1.2.3.4"],
    [false , "1111:2222:3333"],
    [false , "1111:2222:33334444:5555:6666:1.2.3.4"],
    [false , "1111:2222:33334444:5555:6666:7777:8888"],
    [false , "1111:2222:3333:"],
    [false , "1111:2222:3333:1.2.3.4"],
    [false , "1111:2222:3333:4444"],
    [false , "1111:2222:3333:44445555:6666:1.2.3.4"],
    [false , "1111:2222:3333:44445555:6666:7777:8888"],
    [false , "1111:2222:3333:4444:"],
    [false , "1111:2222:3333:4444:1.2.3.4"],
    [false , "1111:2222:3333:4444:5555"],
    [false , "1111:2222:3333:4444:55556666:1.2.3.4"],
    [false , "1111:2222:3333:4444:55556666:7777:8888"],
    [false , "1111:2222:3333:4444:5555:"],
    [false , "1111:2222:3333:4444:5555:1.2.3.4"],
    [false , "1111:2222:3333:4444:5555:6666"],
    [false , "1111:2222:3333:4444:5555:66661.2.3.4"],
    [false , "1111:2222:3333:4444:5555:66667777:8888"],
    [false , "1111:2222:3333:4444:5555:6666:"],
    [false , "1111:2222:3333:4444:5555:6666:00.00.00.00"],
    [false , "1111:2222:3333:4444:5555:6666:000.000.000.000"],
    [false , "1111:2222:3333:4444:5555:6666:1.2.3.4.5"],
    [false , "1111:2222:3333:4444:5555:6666:255.255.255255"],
    [false , "1111:2222:3333:4444:5555:6666:255.255255.255"],
    [false , "1111:2222:3333:4444:5555:6666:255255.255.255"],
    [false , "1111:2222:3333:4444:5555:6666:256.256.256.256"],
    [false , "1111:2222:3333:4444:5555:6666:7777"],
    [false , "1111:2222:3333:4444:5555:6666:77778888"],
    [false , "1111:2222:3333:4444:5555:6666:7777:"],
    [false , "1111:2222:3333:4444:5555:6666:7777:1.2.3.4"],
    [false , "1111:2222:3333:4444:5555:6666:7777:8888:"],
    [false , "1111:2222:3333:4444:5555:6666:7777:8888:1.2.3.4"],
    [false , "1111:2222:3333:4444:5555:6666:7777:8888:9999"],
    [false , "1111:2222:3333:4444:5555:6666:7777:8888::"],
    [false , "1111:2222:3333:4444:5555:6666:7777:::"],
    [false , "1111:2222:3333:4444:5555:6666::1.2.3.4"],
    [false , "1111:2222:3333:4444:5555:6666::8888:"],
    [false , "1111:2222:3333:4444:5555:6666:::"],
    [false , "1111:2222:3333:4444:5555:6666:::8888"],
    [false , "1111:2222:3333:4444:5555::7777:8888:"],
    [false , "1111:2222:3333:4444:5555::7777::"],
    [false , "1111:2222:3333:4444:5555::8888:"],
    [false , "1111:2222:3333:4444:5555:::"],
    [false , "1111:2222:3333:4444:5555:::1.2.3.4"],
    [false , "1111:2222:3333:4444:5555:::7777:8888"],
    [false , "1111:2222:3333:4444::5555:"],
    [false , "1111:2222:3333:4444::6666:7777:8888:"],
    [false , "1111:2222:3333:4444::6666:7777::"],
    [false , "1111:2222:3333:4444::6666::8888"],
    [false , "1111:2222:3333:4444::7777:8888:"],
    [false , "1111:2222:3333:4444::8888:"],
    [false , "1111:2222:3333:4444:::"],
    [false , "1111:2222:3333:4444:::6666:1.2.3.4"],
    [false , "1111:2222:3333:4444:::6666:7777:8888"],
    [false , "1111:2222:3333::5555:"],
    [false , "1111:2222:3333::5555:6666:7777:8888:"],
    [false , "1111:2222:3333::5555:6666:7777::"],
    [false , "1111:2222:3333::5555:6666::8888"],
    [false , "1111:2222:3333::5555::1.2.3.4"],
    [false , "1111:2222:3333::5555::7777:8888"],
    [false , "1111:2222:3333::6666:7777:8888:"],
    [false , "1111:2222:3333::7777:8888:"],
    [false , "1111:2222:3333::8888:"],
    [false , "1111:2222:3333:::"],
    [false , "1111:2222:3333:::5555:6666:1.2.3.4"],
    [false , "1111:2222:3333:::5555:6666:7777:8888"],
    [false , "1111:2222::4444:5555:6666:7777:8888:"],
    [false , "1111:2222::4444:5555:6666:7777::"],
    [false , "1111:2222::4444:5555:6666::8888"],
    [false , "1111:2222::4444:5555::1.2.3.4"],
    [false , "1111:2222::4444:5555::7777:8888"],
    [false , "1111:2222::4444::6666:1.2.3.4"],
    [false , "1111:2222::4444::6666:7777:8888"],
    [false , "1111:2222::5555:"],
    [false , "1111:2222::5555:6666:7777:8888:"],
    [false , "1111:2222::6666:7777:8888:"],
    [false , "1111:2222::7777:8888:"],
    [false , "1111:2222::8888:"],
    [false , "1111:2222:::"],
    [false , "1111:2222:::4444:5555:6666:1.2.3.4"],
    [false , "1111:2222:::4444:5555:6666:7777:8888"],
    [false , "1111::3333:4444:5555:6666:7777:8888:"],
    [false , "1111::3333:4444:5555:6666:7777::"],
    [false , "1111::3333:4444:5555:6666::8888"],
    [false , "1111::3333:4444:5555::1.2.3.4"],
    [false , "1111::3333:4444:5555::7777:8888"],
    [false , "1111::3333:4444::6666:1.2.3.4"],
    [false , "1111::3333:4444::6666:7777:8888"],
    [false , "1111::3333::5555:6666:1.2.3.4"],
    [false , "1111::3333::5555:6666:7777:8888"],
    [false , "1111::4444:5555:6666:7777:8888:"],
    [false , "1111::5555:"],
    [false , "1111::5555:6666:7777:8888:"],
    [false , "1111::6666:7777:8888:"],
    [false , "1111::7777:8888:"],
    [false , "1111::8888:"],
    [false , "1111:::"],
    [false , "1111:::3333:4444:5555:6666:1.2.3.4"],
    [false , "1111:::3333:4444:5555:6666:7777:8888"],
    [false , "123"],
    [false , "12345::6:7:8"],
    [false , "192.168.0.256"],
    [false , "192.168.256.0"],
    [false , "1:2:3:4:5:6:7:8:9"],
    [false , "1:2:3::4:5:6:7:8:9"],
    [false , "1:2:3::4:5::7:8"],
    [false , "1::1.2.256.4"],
    [false , "1::1.2.3.256"],
    [false , "1::1.2.3.300"],
    [false , "1::1.2.3.900"],
    [false , "1::1.2.300.4"],
    [false , "1::1.2.900.4"],
    [false , "1::1.256.3.4"],
    [false , "1::1.300.3.4"],
    [false , "1::1.900.3.4"],
    [false , "1::256.2.3.4"],
    [false , "1::260.2.3.4"],
    [false , "1::2::3"],
    [false , "1::300.2.3.4"],
    [false , "1::300.300.300.300"],
    [false , "1::3000.30.30.30"],
    [false , "1::400.2.3.4"],
    [false , "1::5:1.2.256.4"],
    [false , "1::5:1.2.3.256"],
    [false , "1::5:1.2.3.300"],
    [false , "1::5:1.2.3.900"],
    [false , "1::5:1.2.300.4"],
    [false , "1::5:1.2.900.4"],
    [false , "1::5:1.256.3.4"],
    [false , "1::5:1.300.3.4"],
    [false , "1::5:1.900.3.4"],
    [false , "1::5:256.2.3.4"],
    [false , "1::5:260.2.3.4"],
    [false , "1::5:300.2.3.4"],
    [false , "1::5:300.300.300.300"],
    [false , "1::5:3000.30.30.30"],
    [false , "1::5:400.2.3.4"],
    [false , "1::5:900.2.3.4"],
    [false , "1::900.2.3.4"],
    [false , "1:::3:4:5"],
    [false , "2001:0000:1234: 0000:0000:C1C0:ABCD:0876"],
    [false , "2001:0000:1234:0000:00001:C1C0:ABCD:0876"],
    [false , "2001:0000:1234:0000:0000:C1C0:ABCD:0876  0"],
    [false , "2001:1:1:1:1:1:255Z255X255Y255"],
    [false , "2001::FFD3::57ab"],
    [false , "2001:DB8:0:0:8:800:200C:417A:221"],
    [false , "2001:db8:85a3::8a2e:37023:7334"],
    [false , "2001:db8:85a3::8a2e:370k:7334"],
    [false , "255.256.255.255"],
    [false , "256.255.255.255"],
    [false , "3ffe:0b00:0000:0001:0000:0000:000a"],
    [false , "3ffe:b00::1::a"],
    [false , ":"],
    [false , ":1.2.3.4"],
    [false , ":1111:2222:3333:4444:5555:6666:1.2.3.4"],
    [false , ":1111:2222:3333:4444:5555:6666:7777:8888"],
    [false , ":1111:2222:3333:4444:5555:6666:7777::"],
    [false , ":1111:2222:3333:4444:5555:6666::"],
    [false , ":1111:2222:3333:4444:5555:6666::8888"],
    [false , ":1111:2222:3333:4444:5555::"],
    [false , ":1111:2222:3333:4444:5555::1.2.3.4"],
    [false , ":1111:2222:3333:4444:5555::7777:8888"],
    [false , ":1111:2222:3333:4444:5555::8888"],
    [false , ":1111:2222:3333:4444::"],
    [false , ":1111:2222:3333:4444::1.2.3.4"],
    [false , ":1111:2222:3333:4444::5555"],
    [false , ":1111:2222:3333:4444::6666:1.2.3.4"],
    [false , ":1111:2222:3333:4444::6666:7777:8888"],
    [false , ":1111:2222:3333:4444::7777:8888"],
    [false , ":1111:2222:3333:4444::8888"],
    [false , ":1111:2222:3333::"],
    [false , ":1111:2222:3333::1.2.3.4"],
    [false , ":1111:2222:3333::5555"],
    [false , ":1111:2222:3333::5555:6666:1.2.3.4"],
    [false , ":1111:2222:3333::5555:6666:7777:8888"],
    [false , ":1111:2222:3333::6666:1.2.3.4"],
    [false , ":1111:2222:3333::6666:7777:8888"],
    [false , ":1111:2222:3333::7777:8888"],
    [false , ":1111:2222:3333::8888"],
    [false , ":1111:2222::"],
    [false , ":1111:2222::1.2.3.4"],
    [false , ":1111:2222::4444:5555:6666:1.2.3.4"],
    [false , ":1111:2222::4444:5555:6666:7777:8888"],
    [false , ":1111:2222::5555"],
    [false , ":1111:2222::5555:6666:1.2.3.4"],
    [false , ":1111:2222::5555:6666:7777:8888"],
    [false , ":1111:2222::6666:1.2.3.4"],
    [false , ":1111:2222::6666:7777:8888"],
    [false , ":1111:2222::7777:8888"],
    [false , ":1111:2222::8888"],
    [false , ":1111::"],
    [false , ":1111::1.2.3.4"],
    [false , ":1111::3333:4444:5555:6666:1.2.3.4"],
    [false , ":1111::3333:4444:5555:6666:7777:8888"],
    [false , ":1111::4444:5555:6666:1.2.3.4"],
    [false , ":1111::4444:5555:6666:7777:8888"],
    [false , ":1111::5555"],
    [false , ":1111::5555:6666:1.2.3.4"],
    [false , ":1111::5555:6666:7777:8888"],
    [false , ":1111::6666:1.2.3.4"],
    [false , ":1111::6666:7777:8888"],
    [false , ":1111::7777:8888"],
    [false , ":1111::8888"],
    [false , ":2222:3333:4444:5555:6666:1.2.3.4"],
    [false , ":2222:3333:4444:5555:6666:7777:8888"],
    [false , ":3333:4444:5555:6666:1.2.3.4"],
    [false , ":3333:4444:5555:6666:7777:8888"],
    [false , ":4444:5555:6666:1.2.3.4"],
    [false , ":4444:5555:6666:7777:8888"],
    [false , ":5555:6666:1.2.3.4"],
    [false , ":5555:6666:7777:8888"],
    [false , ":6666:1.2.3.4"],
    [false , ":6666:7777:8888"],
    [false , ":7777:8888"],
    [false , ":8888"],
    [false , "::."],
    [false , "::.."],
    [false , "::..."],
    [false , "::...4"],
    [false , "::..3."],
    [false , "::..3.4"],
    [false , "::.2.."],
    [false , "::.2.3."],
    [false , "::.2.3.4"],
    [false , "::1..."],
    [false , "::1.2.."],
    [false , "::1.2.256.4"],
    [false , "::1.2.3."],
    [false , "::1.2.3.256"],
    [false , "::1.2.3.300"],
    [false , "::1.2.3.900"],
    [false , "::1.2.300.4"],
    [false , "::1.2.900.4"],
    [false , "::1.256.3.4"],
    [false , "::1.300.3.4"],
    [false , "::1.900.3.4"],
    [false , "::1111:2222:3333:4444:5555:6666::"],
    [false , "::2222:3333:4444:5555:6666:7777:1.2.3.4"],
    [false , "::2222:3333:4444:5555:6666:7777:8888:"],
    [false , "::2222:3333:4444:5555:6666:7777:8888:9999"],
    [false , "::2222:3333:4444:5555:7777:8888::"],
    [false , "::2222:3333:4444:5555:7777::8888"],
    [false , "::2222:3333:4444:5555::1.2.3.4"],
    [false , "::2222:3333:4444:5555::7777:8888"],
    [false , "::2222:3333:4444::6666:1.2.3.4"],
    [false , "::2222:3333:4444::6666:7777:8888"],
    [false , "::2222:3333::5555:6666:1.2.3.4"],
    [false , "::2222:3333::5555:6666:7777:8888"],
    [false , "::2222::4444:5555:6666:1.2.3.4"],
    [false , "::2222::4444:5555:6666:7777:8888"],
    [false , "::256.2.3.4"],
    [false , "::260.2.3.4"],
    [false , "::300.2.3.4"],
    [false , "::300.300.300.300"],
    [false , "::3000.30.30.30"],
    [false , "::3333:4444:5555:6666:7777:8888:"],
    [false , "::400.2.3.4"],
    [false , "::4444:5555:6666:7777:8888:"],
    [false , "::5555:"],
    [false , "::5555:6666:7777:8888:"],
    [false , "::6666:7777:8888:"],
    [false , "::7777:8888:"],
    [false , "::8888:"],
    [false , "::900.2.3.4"],
    [false , ":::"],
    [false , ":::1.2.3.4"],
    [false , ":::2222:3333:4444:5555:6666:1.2.3.4"],
    [false , ":::2222:3333:4444:5555:6666:7777:8888"],
    [false , ":::3333:4444:5555:6666:7777:8888"],
    [false , ":::4444:5555:6666:1.2.3.4"],
    [false , ":::4444:5555:6666:7777:8888"],
    [false , ":::5555"],
    [false , ":::5555:6666:1.2.3.4"],
    [false , ":::5555:6666:7777:8888"],
    [false , ":::6666:1.2.3.4"],
    [false , ":::6666:7777:8888"],
    [false , ":::7777:8888"],
    [false , ":::8888"],
    [false , "::ffff:192x168.1.26"],
    [false , "::ffff:2.3.4"],
    [false , "::ffff:257.1.2.3"],
    [false , "FF01::101::2"],
    [false , "FF02:0000:0000:0000:0000:0000:0000:0000:0001"],
    [false , "XXXX:XXXX:XXXX:XXXX:XXXX:XXXX:1.2.3.4"],
    [false , "XXXX:XXXX:XXXX:XXXX:XXXX:XXXX:XXXX:XXXX"],
    [false , "fe80:0000:0000:0000:0204:61ff:254.157.241.086"],
    [false , "fe80::4413:c8ae:2821:5852%10"],
    [false , "ldkfj"],
    [false , "mydomain.com"],
    [false , "test.mydomain.com"],
    [true , "0000:0000:0000:0000:0000:0000:0000:0000"],
    [true , "0000:0000:0000:0000:0000:0000:0000:0001"],
    [true , "0:0:0:0:0:0:0:0"],
    [true , "0:0:0:0:0:0:0:1"],
    [true , "0:0:0:0:0:0:0::"],
    [true , "0:0:0:0:0:0:13.1.68.3"],
    [true , "0:0:0:0:0:0::"],
    [true , "0:0:0:0:0::"],
    [true , "0:0:0:0:0:FFFF:129.144.52.38"],
    [true , "0:0:0:0::"],
    [true , "0:0:0::"],
    [true , "0:0::"],
    [true , "0::"],
    [true , "0:a:b:c:d:e:f::"],
    [true , "1.2.3.4"],
    [true , "1111:2222:3333:4444:5555:6666:123.123.123.123"],
    [true , "1111:2222:3333:4444:5555:6666:7777:8888"],
    [true , "1111:2222:3333:4444:5555:6666:7777::"],
    [true , "1111:2222:3333:4444:5555:6666::"],
    [true , "1111:2222:3333:4444:5555:6666::8888"],
    [true , "1111:2222:3333:4444:5555::"],
    [true , "1111:2222:3333:4444:5555::123.123.123.123"],
    [true , "1111:2222:3333:4444:5555::7777:8888"],
    [true , "1111:2222:3333:4444:5555::8888"],
    [true , "1111:2222:3333:4444::"],
    [true , "1111:2222:3333:4444::123.123.123.123"],
    [true , "1111:2222:3333:4444::6666:123.123.123.123"],
    [true , "1111:2222:3333:4444::6666:7777:8888"],
    [true , "1111:2222:3333:4444::7777:8888"],
    [true , "1111:2222:3333:4444::8888"],
    [true , "1111:2222:3333::"],
    [true , "1111:2222:3333::123.123.123.123"],
    [true , "1111:2222:3333::5555:6666:123.123.123.123"],
    [true , "1111:2222:3333::5555:6666:7777:8888"],
    [true , "1111:2222:3333::6666:123.123.123.123"],
    [true , "1111:2222:3333::6666:7777:8888"],
    [true , "1111:2222:3333::7777:8888"],
    [true , "1111:2222:3333::8888"],
    [true , "1111:2222::"],
    [true , "1111:2222::123.123.123.123"],
    [true , "1111:2222::4444:5555:6666:123.123.123.123"],
    [true , "1111:2222::4444:5555:6666:7777:8888"],
    [true , "1111:2222::5555:6666:123.123.123.123"],
    [true , "1111:2222::5555:6666:7777:8888"],
    [true , "1111:2222::6666:123.123.123.123"],
    [true , "1111:2222::6666:7777:8888"],
    [true , "1111:2222::7777:8888"],
    [true , "1111:2222::8888"],
    [true , "1111::"],
    [true , "1111::123.123.123.123"],
    [true , "1111::3333:4444:5555:6666:123.123.123.123"],
    [true , "1111::3333:4444:5555:6666:7777:8888"],
    [true , "1111::4444:5555:6666:123.123.123.123"],
    [true , "1111::4444:5555:6666:7777:8888"],
    [true , "1111::5555:6666:123.123.123.123"],
    [true , "1111::5555:6666:7777:8888"],
    [true , "1111::6666:123.123.123.123"],
    [true , "1111::6666:7777:8888"],
    [true , "1111::7777:8888"],
    [true , "1111::8888"],
    [true , "123.23.34.2"],
    [true , "172.26.168.134"],
    [true , "192.168.0.0"],
    [true , "192.168.128.255"],
    [true , "1:2:3:4:5:6:1.2.3.4"],
    [true , "1:2:3:4:5:6:7:8"],
    [true , "1:2:3:4:5:6::"],
    [true , "1:2:3:4:5:6::8"],
    [true , "1:2:3:4:5::"],
    [true , "1:2:3:4:5::1.2.3.4"],
    [true , "1:2:3:4:5::7:8"],
    [true , "1:2:3:4:5::8"],
    [true , "1:2:3:4::"],
    [true , "1:2:3:4::1.2.3.4"],
    [true , "1:2:3:4::5:1.2.3.4"],
    [true , "1:2:3:4::7:8"],
    [true , "1:2:3:4::8"],
    [true , "1:2:3::"],
    [true , "1:2:3::1.2.3.4"],
    [true , "1:2:3::5:1.2.3.4"],
    [true , "1:2:3::7:8"],
    [true , "1:2:3::8"],
    [true , "1:2::"],
    [true , "1:2::1.2.3.4"],
    [true , "1:2::5:1.2.3.4"],
    [true , "1:2::7:8"],
    [true , "1:2::8"],
    [true , "1::"],
    [true , "1::1.2.3.4"],
    [true , "1::2:3"],
    [true , "1::2:3:4"],
    [true , "1::2:3:4:5"],
    [true , "1::2:3:4:5:6"],
    [true , "1::2:3:4:5:6:7"],
    [true , "1::5:1.2.3.4"],
    [true , "1::5:11.22.33.44"],
    [true , "1::7:8"],
    [true , "1::8"],
    [true , "2001:0000:1234:0000:0000:C1C0:ABCD:0876"],
    [true , "2001:0:1234::C1C0:ABCD:876"],
    [true , "2001:0db8:0000:0000:0000:0000:1428:57ab"],
    [true , "2001:0db8:0000:0000:0000::1428:57ab"],
    [true , "2001:0db8:0:0:0:0:1428:57ab"],
    [true , "2001:0db8:0:0::1428:57ab"],
    [true , "2001:0db8:1234:0000:0000:0000:0000:0000"],
    [true , "2001:0db8:1234::"],
    [true , "2001:0db8:1234:ffff:ffff:ffff:ffff:ffff"],
    [true , "2001:0db8:85a3:0000:0000:8a2e:0370:7334"],
    [true , "2001:0db8::1428:57ab"],
    [true , "2001:2:3:4:5:6:7:134"],
    [true , "2001:DB8:0:0:8:800:200C:417A"],
    [true , "2001:DB8::8:800:200C:417A"],
    [true , "2001:db8:85a3:0:0:8a2e:370:7334"],
    [true , "2001:db8:85a3::8a2e:370:7334"],
    [true , "2001:db8::"],
    [true , "2001:db8::1428:57ab"],
    [true , "2001:db8:a::123"],
    [true , "2002::"],
    [true , "2::10"],
    [true , "3ffe:0b00:0000:0000:0001:0000:0000:000a"],
    [true , "3ffe:b00::1:0:0:a"],
    [true , "::"],
    [true , "::0"],
    [true , "::0:0"],
    [true , "::0:0:0"],
    [true , "::0:0:0:0"],
    [true , "::0:0:0:0:0"],
    [true , "::0:0:0:0:0:0"],
    [true , "::0:0:0:0:0:0:0"],
    [true , "::0:a:b:c:d:e:f"],
    [true , "::1"],
    [true , "::123.123.123.123"],
    [true , "::13.1.68.3"],
    [true , "::2222:3333:4444:5555:6666:123.123.123.123"],
    [true , "::2222:3333:4444:5555:6666:7777:8888"],
    [true , "::2:3"],
    [true , "::2:3:4"],
    [true , "::2:3:4:5"],
    [true , "::2:3:4:5:6"],
    [true , "::2:3:4:5:6:7"],
    [true , "::2:3:4:5:6:7:8"],
    [true , "::3333:4444:5555:6666:7777:8888"],
    [true , "::4444:5555:6666:123.123.123.123"],
    [true , "::4444:5555:6666:7777:8888"],
    [true , "::5555:6666:123.123.123.123"],
    [true , "::5555:6666:7777:8888"],
    [true , "::6666:123.123.123.123"],
    [true , "::6666:7777:8888"],
    [true , "::7777:8888"],
    [true , "::8"],
    [true , "::8888"],
    [true , "::FFFF:129.144.52.38"],
    [true , "::ffff:0:0"],
    [true , "::ffff:0c22:384e"],
    [true , "::ffff:12.34.56.78"],
    [true , "::ffff:192.0.2.128"],
    [true , "::ffff:192.168.1.1"],
    [true , "::ffff:192.168.1.26"],
    [true , "::ffff:c000:280"],
    [true , "FF01:0:0:0:0:0:0:101"],
    [true , "FF01::101"],
    [true , "FF02:0000:0000:0000:0000:0000:0000:0001"],
    [true , "FF02::1"],
    [true , "a:b:c:d:e:f:0::"],
    [true , "fe80:0000:0000:0000:0204:61ff:fe9d:f156"],
    [true , "fe80:0:0:0:204:61ff:254.157.241.86"],
    [true , "fe80:0:0:0:204:61ff:fe9d:f156"],
    [true , "fe80::"],
    [true , "fe80::1"],
    [true , "fe80::204:61ff:254.157.241.86"],
    [true , "fe80::204:61ff:fe9d:f156"],
    [true , "fe80::217:f2ff:254.7.237.98"],
    [true , "fe80::217:f2ff:fe07:ed62"],
    [true , "ff02::1"]
];

exports.get_ipany_re = {
    /* jshint maxlen: false */
    'IPv6, Prefix': function (test) {
        /* for x-*-ip headers */
        test.expect(2);
        // it must fail as of not valide
        test.ok(!net.isIPv6('IPv6:2001:db8:85a3::8a2e:370:7334'));
        // must okay!
        test.ok(net.isIPv6('2001:db8:85a3::8a2e:370:7334'));
        test.done();
    },
    'IP fixtures check': function (test) {
        test.expect(ip_fixtures.length);
        for (var i in ip_fixtures) {
            var match = net_utils.get_ipany_re('^','$').test(ip_fixtures[i][1]);
            // console.log('IP:', "'"+ip_fixtures[i][1]+"'" , 'Expected:', ip_fixtures[i][0] , 'Match:' , match);
            test.ok((match===ip_fixtures[i][0]), ip_fixtures[i][1] + ' - Expected: ' + ip_fixtures[i][0] + ' - Match: ' + match);
        }
        test.done();
    },
    'IPv4, bare': function (test) {
        /* for x-*-ip headers */
        test.expect(2);
        var match = net_utils.get_ipany_re().exec('127.0.0.1');
        test.equal(match[1], '127.0.0.1');
        test.equal(match.length, 2);
        test.done();
    },
    'IPv4, Received header, parens': function (test) {
        test.expect(2);
        var received_re = net_utils.get_ipany_re('^Received:.*?[\\[\\(]', '[\\]\\)]');
        var match = received_re.exec('Received: from unknown (HELO mail.theartfarm.com) (127.0.0.30) by mail.theartfarm.com with SMTP; 5 Sep 2015 14:29:00 -0000');
        test.equal(match[1], '127.0.0.30');
        test.equal(match.length, 2);
        test.done();
    },
    'IPv4, Received header, bracketed, expedia': function (test) {
        test.expect(2);
        var received_header = 'Received: from mta2.expediamail.com (mta2.expediamail.com [66.231.89.19]) by mail.theartfarm.com (Haraka/2.6.2-toaster) with ESMTPS id C669CF18-1C1C-484C-8A5B-A89088B048CB.1 envelope-from <bounce-857_HTML-202764435-1098240-260085-60@bounce.global.expediamail.com> (version=TLSv1/SSLv3 cipher=AES256-SHA verify=NO); Sat, 05 Sep 2015 07:28:57 -0700';
        var received_re = net_utils.get_ipany_re('^Received:.*?[\\[\\(]', '[\\]\\)]');
        var match = received_re.exec(received_header);
        test.equal(match[1], '66.231.89.19');
        test.equal(match.length, 2);
        test.done();
    },
    'IPv4, Received header, bracketed, github': function (test) {
        test.expect(2);
        var received_re = net_utils.get_ipany_re('^Received:.*?[\\[\\(]', '[\\]\\)]');
        var match = received_re.exec('Received: from github-smtp2a-ext-cp1-prd.iad.github.net (github-smtp2-ext5.iad.github.net [192.30.252.196])');
        test.equal(match[1], '192.30.252.196');
        test.equal(match.length, 2);
        test.done();
    },
    'IPv6, Received header, bracketed': function (test) {
        test.expect(2);
        var received_header = 'Received: from ?IPv6:2601:184:c001:5cf7:a53f:baf7:aaf3:bce7? ([2601:184:c001:5cf7:a53f:baf7:aaf3:bce7])';
        var received_re = net_utils.get_ipany_re('^Received:.*?[\\[\\(]', '[\\]\\)]');
        var match = received_re.exec(received_header);
        test.equal(match[1], '2601:184:c001:5cf7:a53f:baf7:aaf3:bce7');
        test.equal(match.length, 2);
        test.done();
    },
    'IPv6, Received header, bracketed, IPv6 prefix': function (test) {
        test.expect(2);
        var received_re = net_utils.get_ipany_re('^Received:.*?[\\[\\(](?:IPv6:)?', '[\\]\\)]');
        var match = received_re.exec('Received: from hub.freebsd.org (hub.freebsd.org [IPv6:2001:1900:2254:206c::16:88])');
        test.equal(match[1], '2001:1900:2254:206c::16:88');
        test.equal(match.length, 2);
        test.done();
    },
    'IPv6, folded Received header, bracketed, IPv6 prefix': function (test) {
        test.expect(2);
        /* note the use of [\s\S], '.' doesn't match newlines in JS regexp */
        var received_re = net_utils.get_ipany_re('^Received:[\\s\\S]*?[\\[\\(](?:IPv6:)?', '[\\]\\)]');
        var match = received_re.exec('Received: from freefall.freebsd.org (freefall.freebsd.org\r\n [IPv6:2001:1900:2254:206c::16:87])');
        if (match) {
            test.equal(match[1], '2001:1900:2254:206c::16:87');
            test.equal(match.length, 2);
        }
        test.done();
    },
    'IPv6, Received header, bracketed, IPv6 prefix, localhost compressed': function (test) {
        test.expect(2);
        var received_re = net_utils.get_ipany_re('^Received:.*?[\\[\\(](?:IPv6:)?', '[\\]\\)]');
        var match = received_re.exec('Received: from ietfa.amsl.com (localhost [IPv6:::1])');
        test.equal(match[1], '::1');
        test.equal(match.length, 2);
        test.done();
    },
};

exports.get_ips_by_host = {
    'get_ips_by_host, servedby.tnpi.net': function (test) {
        test.expect(2);
        net_utils.get_ips_by_host('servedby.tnpi.net', function (err, res) {
            // console.log(arguments);
            if (err) {
                console.error(err);
            }
            test.deepEqual(err, []);
            test.deepEqual(res.sort(), [
                '192.48.85.146',
                '192.48.85.147',
                '192.48.85.148',
                '192.48.85.149',
                '2607:f060:b008:feed::2'
            ].sort());
            test.done();
        });
    },
};

