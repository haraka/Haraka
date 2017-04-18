"use strict";

var net_utils   = require('haraka-net-utils');

var config      = require('../config');

module.exports = function (mx) {

    var tls_config = net_utils.load_tls_ini();
    var tls_options = { servername: mx.exchange };
    var config_options = [
        'key', 'cert', 'ciphers', 'dhparam',
        'requestCert', 'honorCipherOrder', 'rejectUnauthorized'
    ];

    for (var i = 0; i < config_options.length; i++) {
        var opt = config_options[i];
        if (tls_config.main[opt] === undefined) { continue; }
        tls_options[opt] = tls_config.main[opt];
    }

    if (tls_config.outbound) {
        for (var j = 0; j < config_options.length; j++) {
            var opt2 = config_options[j];
            if (tls_config.outbound[opt2] === undefined) { continue; }
            tls_options[opt2] = tls_config.outbound[opt2];
        }
    }

    if (tls_options.key) {
        if (Array.isArray(tls_options.key)) {
            tls_options.key = tls_options.key[0];
        }
        tls_options.key = config.get(tls_options.key, 'binary');
    }

    if (tls_options.dhparam) {
        tls_options.dhparam = config.get(tls_options.dhparam, 'binary');
    }

    if (tls_options.cert) {
        if (Array.isArray(tls_options.cert)) {
            tls_options.cert = tls_options.cert[0];
        }
        tls_options.cert = config.get(tls_options.cert, 'binary');
    }

    return tls_options;
};

