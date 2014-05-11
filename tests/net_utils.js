require('../configfile').watch_files = false;
var net_utils = require("../net_utils");

function _check(test, ip, host, ok) {
    test.expect(1);
    test.equals(net_utils.is_ip_in_str(ip, host), ok);
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
    test.equals(expected, net_utils.get_organizational_domain(actual));
    test.done();
}

exports.get_organizational_domain = {
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
        _org_domain(test, 'xn--85x722f.xn--55qx5d.cn', 'xn--85x722f.xn--55qx5d.cn');
    },
    'www.xn--85x722f.xn--55qx5d.cn': function (test) {
        _org_domain(test, 'www.xn--85x722f.xn--55qx5d.cn', 'xn--85x722f.xn--55qx5d.cn');
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
        _org_domain(test, 'www.xn--85x722f.xn--fiqs8s', 'xn--85x722f.xn--fiqs8s');
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
};

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
    'org': function (test) {
        _is_public_suffix(test, 'org', true);
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
