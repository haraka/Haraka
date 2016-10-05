// TLS is built into Haraka. Enabling this plugin advertises STARTTLS.
// see 'haraka -h tls' for help

var tls_socket = require('./tls_socket');

// To create a key:
// openssl req -x509 -nodes -days 2190 -newkey rsa:2048 \
//         -keyout config/tls_key.pem -out config/tls_cert.pem

exports.register = function () {
    var plugin = this;

    // declare first, these opts might be updated by tls.ini
    plugin.tls_opts = {
        key: plugin.load_pem('tls_key.pem'),
        cert: plugin.load_pem('tls_cert.pem'),
    };

    plugin.load_tls_ini();

    plugin.logdebug(plugin.tls_opts);

    if (!plugin.tls_opts.key) {
        plugin.logcrit("config/tls_key.pem not loaded. See 'haraka -h tls'");
        return;
    }
    if (!plugin.tls_opts.cert) {
        plugin.logcrit("config/tls_cert.pem not loaded. See 'haraka -h tls'");
        return;
    }

    plugin.register_hook('capabilities', 'tls_capabilities');
    plugin.register_hook('unrecognized_command', 'tls_unrecognized_command');
};

exports.load_pem = function (file) {
    var plugin = this;
    return plugin.config.get(file, 'binary');
};

exports.load_tls_ini = function () {
    var plugin = this;
    plugin.cfg = tls_socket.load_tls_ini(function () {
        plugin.load_tls_ini();
    });

    var config_options = ['ciphers','requestCert','rejectUnauthorized'];

    for (var i = 0; i < config_options.length; i++) {
        var opt = config_options[i];
        if (plugin.cfg.main[opt] === undefined) { continue; }
        plugin.tls_opts[opt] = plugin.cfg.main[opt];
    }

    if (plugin.cfg.inbound) {
        for (var i = 0; i < config_options.length; i++) {
            var opt = config_options[i];
            if (plugin.cfg.inbound[opt] === undefined) { continue; }
            plugin.tls_opts[opt] = plugin.cfg.inbound[opt];
        }
    }
};

exports.tls_capabilities = function (next, connection) {
    /* Caution: do not advertise STARTTLS if already TLS upgraded */
    if (connection.tls.enabled) { return next(); }

    var plugin = this;

    if (tls_socket.is_no_tls_host(plugin.cfg, connection.remote.ip)) {
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

exports.tls_unrecognized_command = function (next, connection, params) {
    /* Watch for STARTTLS directive from client. */
    if (!connection.tls.advertised) { return next(); }
    if (params[0].toUpperCase() !== 'STARTTLS') { return next(); }

    /* Respond to STARTTLS command. */
    connection.respond(220, "Go ahead.");

    var plugin = this;
    var timed_out = false;
    // adjust plugin.timeout like so: echo '45' > config/tls.timeout
    var timeout = plugin.timeout - 1;
    var timer;
    if (timeout && timeout > 0) {
        timer = setTimeout(function () {
            timed_out = true;
            connection.logerror(plugin, 'timeout');
            plugin.set_notls(connection.remote.ip);
            return next(DENYSOFTDISCONNECT);
        }, timeout * 1000);
    }

    connection.notes.tls_timer = timer;

    var upgrade_cb = function (authorized, verifyError, cert, cipher) {
        if (timed_out) { return; }
        clearTimeout(timer);
        connection.reset_transaction(function () {
            connection.set('hello', 'host', undefined);
            connection.set('tls', 'enabled', true);
            connection.set('tls', 'cipher', cipher);
            connection.notes.tls = {
                authorized: authorized,
                authorizationError: verifyError,
                peerCertificate: cert,
                cipher: cipher
            };
            connection.loginfo(plugin, 'secured:' +
                ((cipher) ? ' cipher=' + cipher.name + ' version=' + cipher.version : '') +
                ' verified=' + authorized +
                ((verifyError) ? ' error="' + verifyError + '"' : '' ) +
                ((cert && cert.subject) ? ' cn="' + cert.subject.CN + '"' +
                ' organization="' + cert.subject.O + '"' : '') +
                ((cert && cert.issuer) ? ' issuer="' + cert.issuer.O + '"' : '') +
                ((cert && cert.valid_to) ? ' expires="' + cert.valid_to + '"' : '') +
                ((cert && cert.fingerprint) ? ' fingerprint=' + cert.fingerprint : ''));
            return next(OK);  // Return OK as we responded to the client
        });
    };

    /* Upgrade the connection to TLS. */
    connection.client.upgrade(plugin.tls_opts, upgrade_cb);
};

exports.hook_disconnect = function (next, connection) {
    if (connection.notes.tls_timer) {
        clearTimeout(connection.notes.tls_timer);
    }
    return next();
};
