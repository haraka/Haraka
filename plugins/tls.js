'use strict';
// TLS is built into Haraka. This plugin conditionally advertises STARTTLS.
// see 'haraka -h tls' for help

var net_utils = require('haraka-net-utils');
var tls_socket = require('./tls_socket');

exports.register = function () {
    var plugin = this;
    plugin.load_errs = [];

    // declare first, these opts might be updated by tls.ini
    plugin.tls_opts = {
        key: 'tls_key.pem',
        cert: 'tls_cert.pem',
    };

    plugin.load_tls_ini();
    plugin.load_tls_opts();

    // make sure TLS setup was valid before registering hooks
    if (plugin.load_errs.length > 0) return;
    if (!plugin.tls_opts.cert.length) {
        plugin.logerror("no certificates loaded");
        return;
    }
    if (!plugin.tls_opts.key.length) {
        plugin.logerror("no keys loaded");
        return;
    }

    plugin.tls_opts_valid = true;

    plugin.register_hook('capabilities', 'advertise_starttls');
    plugin.register_hook('unrecognized_command', 'upgrade_connection');
};

exports.shutdown = function () {
    if (tls_socket.shutdown) tls_socket.shutdown();
};

exports.load_err = function (errMsg) {
    this.logcrit(errMsg + " See 'haraka -h tls'");
    this.load_errs.push(errMsg);
};

exports.load_pem = function (file) {
    var plugin = this;
    return plugin.config.get(file, 'binary');
};

exports.load_tls_ini = function () {
    var plugin = this;

    plugin.cfg = net_utils.load_tls_ini(function () {
        plugin.load_tls_ini();
    });

    var config_options = ['ciphers','requestCert','rejectUnauthorized',
        'key','cert','honorCipherOrder','ecdhCurve','dhparam',
        'secureProtocol','enableOCSPStapling'];

    for (let i = 0; i < config_options.length; i++) {
        let opt = config_options[i];
        if (plugin.cfg.main[opt] === undefined) { continue; }
        plugin.tls_opts[opt] = plugin.cfg.main[opt];
    }

    if (plugin.cfg.inbound) {
        for (let i = 0; i < config_options.length; i++) {
            let opt = config_options[i];
            if (plugin.cfg.inbound[opt] === undefined) { continue; }
            plugin.tls_opts[opt] = plugin.cfg.inbound[opt];
        }
    }
};

exports.load_tls_opts = function () {
    var plugin = this;

    plugin.logdebug(plugin.tls_opts);

    if (plugin.tls_opts.dhparam) {
        plugin.tls_opts.dhparam = plugin.load_pem(plugin.tls_opts.dhparam);
        if (!plugin.tls_opts.dhparam) {
            plugin.load_err("dhparam not loaded.");
        }
    }

    // make non-array key/cert option into Arrays with one entry
    if (!(Array.isArray(plugin.tls_opts.key))) {
        plugin.tls_opts.key = [plugin.tls_opts.key];
    }
    if (!(Array.isArray(plugin.tls_opts.cert))) {
        plugin.tls_opts.cert = [plugin.tls_opts.cert];
    }

    if (plugin.tls_opts.key.length != plugin.tls_opts.cert.length) {
        plugin.load_err("number of keys (" +
                       plugin.tls_opts.key.length + ") doesn't match number of certs (" +
                       plugin.tls_opts.cert.length + ").");
    }

    // turn key/cert file names into actual key/cert binary data
    plugin.tls_opts.key = plugin.tls_opts.key.map(function (keyFileName) {
        var key = plugin.load_pem(keyFileName);
        if (!key) {
            plugin.load_err("tls key " + keyFileName + " could not be loaded.");
        }
        return key;
    });
    plugin.tls_opts.cert = plugin.tls_opts.cert.map(function (certFileName) {
        var cert = plugin.load_pem(certFileName);
        if (!cert) {
            plugin.load_err("tls cert " + certFileName + " could not be loaded.");
        }
        return cert;
    });

    plugin.logdebug(plugin.tls_opts);
};

exports.advertise_starttls = function (next, connection) {
    /* Caution: do not advertise STARTTLS if already TLS upgraded */
    if (connection.tls.enabled) { return next(); }

    var plugin = this;

    if (net_utils.ip_in_list(plugin.cfg.no_tls_hosts, connection.remote.ip)) {
        return next();
    }

    var enable_tls = function () {
        connection.capabilities.push('STARTTLS');
        connection.tls.advertised = true;
        next();
    };

    if (!plugin.cfg.redis || !server.notes.redis) {
        return enable_tls();
    }

    var redis = server.notes.redis;
    var dbkey = 'no_tls|' + connection.remote.ip;

    redis.get(dbkey, function (err, dbr) {
        if (err) {
            connection.results.add(plugin, {err: err});
            return enable_tls();
        }

        if (!dbr) {
            connection.results.add(plugin, { msg: 'no_tls unset'});
            return enable_tls();
        }

        // last TLS attempt failed
        redis.del(dbkey); // retry TLS next connection.

        connection.results.add(plugin, { msg: 'tls disabled'});
        return next();
    });
};

exports.set_notls = function (ip) {
    var plugin = this;
    if (!plugin.cfg.redis) return;
    if (!plugin.cfg.redis.disable_for_failed_hosts) return;
    if (!server.notes.redis) return;

    server.notes.redis.set('no_tls|' + ip, true);
};

exports.upgrade_connection = function (next, connection, params) {
    if (!connection.tls.advertised) { return next(); }
    /* Watch for STARTTLS directive from client. */
    if (params[0].toUpperCase() !== 'STARTTLS') { return next(); }

    /* Respond to STARTTLS command. */
    connection.respond(220, "Go ahead.");

    var plugin = this;
    var called_next = false;
    // adjust plugin.timeout like so: echo '45' > config/tls.timeout
    var timeout = plugin.timeout - 1;

    function nextOnce (disconnected) {
        if (called_next) return;
        called_next = true;
        clearTimeout(connection.notes.tls_timer);
        if (!disconnected) connection.logerror(plugin, 'timeout');
        plugin.set_notls(connection.remote.ip);
        return next(DENYSOFTDISCONNECT);
    }

    if (timeout && timeout > 0) {
        connection.notes.tls_timer = setTimeout(nextOnce, timeout * 1000);
    }

    connection.notes.cleanUpDisconnect = nextOnce;

    var upgrade_cb = function (authorized, verifyErr, cert, cipher) {
        if (called_next) { return; }
        clearTimeout(connection.notes.tls_timer);
        called_next = true;
        connection.reset_transaction(function () {
            connection.set('hello', 'host', undefined);
            connection.set('tls', 'enabled', true);
            connection.set('tls', 'cipher', cipher);
            connection.notes.tls = {
                authorized: authorized,
                authorizationError: verifyErr,
                peerCertificate: cert,
                cipher: cipher
            };
            connection.results.add(plugin, connection.tls);
            plugin.emit_upgrade_msg(connection, authorized, verifyErr, cert, cipher);
            return next(OK);  // Return OK as we responded to the client
        });
    };

    /* Upgrade the connection to TLS. */
    connection.client.upgrade(plugin.tls_opts, upgrade_cb);
};

exports.hook_disconnect = function (next, connection) {
    if (connection.notes.cleanUpDisconnect) {
        connection.notes.cleanUpDisconnect(true);
    }
    return next();
};

exports.emit_upgrade_msg = function (c, authorized, verifyErr, cert, cipher) {
    var plugin = this;
    var msg = 'secured:';
    if (cipher) {
        msg += ' cipher='  + cipher.name + ' version=' + cipher.version;
    }
    msg += ' verified=' + authorized;
    if (verifyErr) msg += ' error="' + verifyErr + '"';
    if (cert) {
        if (cert.subject) {
            msg += ' cn="' + cert.subject.CN + '"' +
                   ' organization="' + cert.subject.O + '"';
        }
        if (cert.issuer)      msg += ' issuer="'     + cert.issuer.O + '"';
        if (cert.valid_to)    msg += ' expires="'    + cert.valid_to + '"';
        if (cert.fingerprint) msg += ' fingerprint=' + cert.fingerprint;
    }

    c.loginfo(plugin,  msg);
    return msg;
}
