var test = require("tap").test;
require('../configfile').watch_files = false;
var net_utils = require("../net_utils");

var static = [
['74.125.82.182', 'mail-we0-f182.google.com'],
['74.125.82.53', 'mail-ww0-f53.google.com'],
];

test("Static rDNS", function (t) {
    for (var i=0; i<static.length; i++) {
        t.equals(net_utils.is_ip_in_str(static[i][0],static[i][1]), false);
    }
    t.end();
});

var dynamic = [
['109.168.232.131','host-109-168-232-131.stv.ru'],
['62.198.236.129','0x3ec6ec81.inet.dsl.telianet.dk'],
['123.58.178.17','m17-178.vip.126.com'],
['100.42.67.92','92-67-42-100-dedicated.multacom.com'],
['101.0.57.5','static-bpipl-101.0.57-5.com'],
];

test("Dynamic rDNS", function (t) {
    for (var i=0; i<dynamic.length; i++) {
        t.equals(net_utils.is_ip_in_str(dynamic[i][0],dynamic[i][1]), true);
    }
    t.end();
});
