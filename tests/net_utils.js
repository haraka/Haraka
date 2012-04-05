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
