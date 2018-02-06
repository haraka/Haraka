'use strict';

exports.config     = require('haraka-config');

exports.tls_socket = require('../tls_socket');

exports.get_tls_options = function (mx) {

    const tls_cfg = exports.tls_socket.load_tls_ini();
    const tls_options = JSON.parse(JSON.stringify(tls_cfg.outbound || {}));

    const inheritable_opts = [
        'key', 'cert', 'ciphers', 'dhparam',
        'requestCert', 'honorCipherOrder', 'rejectUnauthorized'
    ];

    tls_options.servername = mx.exchange;

    for (const opt of inheritable_opts) {
        if (tls_options[opt] === undefined) {
            // not declared in tls.ini[section]
            if (tls_cfg.main[opt] !== undefined) {
                // use value from [main] section
                tls_options[opt] = tls_cfg.main[opt];
            }
        }
    }

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
}
