"use strict";

var net_utils   = require('haraka-net-utils');

exports.config = require('../config');

exports.get_tls_options = function (mx) {
    
    var tls_options = net_utils.tls_ini_section_with_defaults('outbound');
    tls_options.servername = mx.exchange;
    
    if (tls_options.key) {
        if (Array.isArray(tls_options.key)) {
            tls_options.key = tls_options.key[0];
        }
        tls_options.key = exports.config.get(tls_options.key, 'binary');
    }

    if (tls_options.dhparam) {
        tls_options.dhparam = exports.config.get(tls_options.dhparam, 'binary');
    }

    if (tls_options.cert) {
        if (Array.isArray(tls_options.cert)) {
            tls_options.cert = tls_options.cert[0];
        }
        tls_options.cert = exports.config.get(tls_options.cert, 'binary');
    }

    return tls_options;
};

