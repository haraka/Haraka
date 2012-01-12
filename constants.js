"use strict";
// Constants

exports.cont               = 900;
exports.stop               = 901;
exports.deny               = 902;
exports.denysoft           = 903;
exports.denydisconnect     = 904;
exports.disconnect         = 905;
exports.ok                 = 906;
exports.next_hook          = 907;
exports.delay              = 908;
exports.denysoftdisconnect = 909;

exports.import = function (object) {
    for (var k in exports) {
        if (exports.hasOwnProperty(k) && k !== "import") {
            object[k.toUpperCase()] = exports[k];
        }
    }
}

exports.translate = function (value) {
    var t = {};
    for (var k in exports) {
        if (typeof exports[k] === 'number') {
            t[exports[k]] = k.toUpperCase();
        }
    }
    if (t[value]) return t[value];
    return 'UNKNOWN';
}
