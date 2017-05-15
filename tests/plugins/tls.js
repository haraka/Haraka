'use strict';

var fs           = require('fs');
var path         = require('path');

var fixtures     = require('haraka-test-fixtures');
var Plugin       = fixtures.plugin;

var _set_up = function (done) {
    this.plugin = new Plugin('tls');
    this.connection = new fixtures.connection.createConnection();

    // use tests/config instead of ./config
    this.plugin.config =
        this.plugin.config.module_config(path.resolve('tests'));
    this.plugin.net_utils.config =
        this.plugin.net_utils.config.module_config(path.resolve('tests'));

    this.plugin.tls_opts = {};
    done();
};

exports.plugin = {
    setUp : _set_up,
    'has function register' : function (test) {
        test.expect(2);
        test.ok(this.plugin);
        test.equal('function', typeof this.plugin.register);
        test.done();
    },
    'has function load_tls_ini' : function (test) {
        test.expect(1);
        test.equal('function', typeof this.plugin.load_tls_ini);
        test.done();
    },
    'has function upgrade_connection' : function (test) {
        test.expect(1);
        test.equal('function', typeof this.plugin.upgrade_connection);
        test.done();
    },
    'has function advertise_starttls' : function (test) {
        test.expect(1);
        test.equal('function', typeof this.plugin.advertise_starttls);
        test.done();
    },
    'has function emit_upgrade_msg' : function (test) {
        test.expect(1);
        test.equal('function', typeof this.plugin.emit_upgrade_msg);
        test.done();
    },
};

function tls_ini_overload (plugin) {
    plugin.config = plugin.config.module_config(path.resolve('tests'));
    plugin.cfg = plugin.config.get('tls.ini', {
        booleans: [
            '-main.honorCipherOrder',
            '-main.requestCert',
            '-main.rejectUnauthorized',
        ]
    });

    var config_options = [
        'ciphers','requestCert','rejectUnauthorized',
        'key','cert','honorCipherOrder','ecdhCurve','dhparam',
        'secureProtocol'
    ];

    for (var i = 0; i < config_options.length; i++) {
        var opt = config_options[i];
        if (plugin.cfg.main[opt] === undefined) { continue; }
        plugin.tls_opts[opt] = plugin.cfg.main[opt];
    }
}

exports.load_tls_ini = {
    setUp : _set_up,
    'loads test/config/tls.ini' : function (test) {
        tls_ini_overload(this.plugin);
        test.expect(6);
        test.equal(true, this.plugin.cfg.main.requestCert);
        test.ok(this.plugin.cfg.main.ciphers);
        test.ok(this.plugin.cfg.no_tls_hosts);
        test.equal(true, this.plugin.cfg.main.honorCipherOrder);
        test.equal('outbound_tls_key.pem', this.plugin.cfg.outbound.key);
        test.equal('outbound_tls_cert.pem', this.plugin.cfg.outbound.cert);
        test.done();
    }
};

exports.load_tls_opts = {
    setUp : function (done) {
        this.plugin = new Plugin('tls');
        this.plugin.tls_opts = {};
        tls_ini_overload(this.plugin);
        done();
    },
    'TLS key loaded' : function (test) {
        test.expect(1);
        this.plugin.load_tls_opts();
        test.ok(this.plugin.tls_opts.key.length);
        test.done();
    },
    'TLS cert loaded' : function (test) {
        test.expect(1);
        this.plugin.load_tls_opts();
        test.ok(this.plugin.tls_opts.cert.length);
        test.done();
    },
    'TLS dhparams loaded' : function (test) {
        test.expect(1);
        this.plugin.load_tls_opts();
        test.equal(this.plugin.tls_opts.dhparam.toString(), '-----BEGIN DH PARAMETERS-----\nMIIBCAKCAQEA5u0Bg9gCrKvYbkCmUe7cZUjZYFbqvbo9UPaR27K5yPklpy2Fy7bT\n+Jbzb/C0zHRD3mx3hoapa/3jB1Zhw31cxNmmwGvblpWNjToBoSydVDAY2BphJxHn\nCMEz3VGqiA4FXKx0R+jLeq5p5rTEuMbXTyxnj/hJesquORc2sy8L410Kw+6UvbPE\ntw9WKwzrpdMxwVSme2voHlpLZuvGqE/paxxnp0kmFp/esda2Aj8xVMEtAMh8lw8v\nfPaeTO94I4/SKJtzLl8j9J6mrq+aTYjljMryt2GJwZNrH41CPuOZYb5MyGAGPCWW\nl/RlqtnAit2IQ4VA1MrITAzoepC144w5CwIBAg==\n-----END DH PARAMETERS-----\n');
        test.done();
    },
};

exports.register = {
    setUp : function (done) {
        this.plugin = new Plugin('tls');

        // overload load_pem to get files from tests/config
        this.plugin.load_pem = function (file) {
            return fs.readFileSync('./tests/config/' + file);
        };

        done();
    },
    'with certs, should call register_hook()' : function (test) {
        test.expect(2);
        this.plugin.register();
        test.ok(this.plugin.cfg.main.requestCert);
        test.ok(this.plugin.register_hook.called);
        // console.log(this.plugin);
        test.done();
    },
};

exports.dont_register = {
    setUp : function (done) {
        this.plugin = new Plugin('tls');

        // overload load_pem
        this.plugin.load_pem = function (file) {
            try {
                return fs.readFileSync('./non-exist/config/' + file);
            }
            catch (ignore) {}
        };

        done();
    },
    'w/o certs, should not call register_hook()' : function (test) {
        test.expect(1);
        this.plugin.register();
        test.equal(this.plugin.register_hook.called, false);
        // console.log(this.plugin);
        test.done();
    },
};

exports.emit_upgrade_msg = {
    setUp : _set_up,
    'should emit a log message': function (test) {
        test.expect(1);
        test.equal(this.plugin.emit_upgrade_msg(this.connection, true, '', {
            subject: {
                CN: 'TLS.subject',
                O: 'TLS.org'
            },
        }),
        'secured: verified=true cn="TLS.subject" organization="TLS.org"');
        test.done();
    },
    'should emit a log message with error': function (test) {
        test.expect(1);
        test.equal(this.plugin.emit_upgrade_msg(this.connection, true, 'oops', {
            subject: {
                CN: 'TLS.subject',
                O: 'TLS.org'
            },
        }),
        'secured: verified=true error="oops" cn="TLS.subject" organization="TLS.org"');
        test.done();
    }
}
