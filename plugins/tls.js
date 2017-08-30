'use strict';
// TLS is built into Haraka. This plugin conditionally advertises STARTTLS.
// see 'haraka -h tls' for help

const tls_socket = require('./tls_socket');

// exported so tests can override config dir
exports.net_utils = require('haraka-net-utils');

exports.register = function () {
    let plugin = this;

    plugin.load_tls_ini();

    plugin.register_hook('capabilities',         'advertise_starttls');
    plugin.register_hook('unrecognized_command', 'upgrade_connection');
}

exports.shutdown = function () {
    if (tls_socket.shutdown) tls_socket.shutdown();
}

exports.load_tls_ini = function () {
    let plugin = this;

    plugin.cfg = tls_socket.load_tls_ini(function () {
        plugin.load_tls_ini();
    });
}

exports.advertise_starttls = function (next, connection) {
    let plugin = this;

    // if no TLS setup incomplete/invalid, don't advertise
    if (!tls_socket.tls_valid) {
        plugin.logerror('no valid TLS config');
        return next();
    }

    /* Caution: do not advertise STARTTLS if already TLS upgraded */
    if (connection.tls.enabled) return next();

    if (plugin.net_utils.ip_in_list(plugin.cfg.no_tls_hosts, connection.remote.ip)) {
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

    redis.get(dbkey, (err, dbr) => {
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
}

exports.set_notls = function (ip) {
    let plugin = this;

    if (!plugin.cfg.redis) return;
    if (!plugin.cfg.redis.disable_for_failed_hosts) return;
    if (!server.notes.redis) return;

    server.notes.redis.set('no_tls|' + ip, true);
}

exports.upgrade_connection = function (next, connection, params) {
    if (!connection.tls.advertised) return next();

    /* Watch for STARTTLS directive from client. */
    if (params[0].toUpperCase() !== 'STARTTLS') return next();

    /* Respond to STARTTLS command. */
    connection.respond(220, "Go ahead.");

    let plugin = this;
    let called_next = false;
    // adjust plugin.timeout like so: echo '45' > config/tls.timeout
    let timeout = plugin.timeout - 1;

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

    /* Upgrade the connection to TLS. */
    connection.client.upgrade((verified, verifyErr, cert, cipher) => {
        if (called_next) return;
        clearTimeout(connection.notes.tls_timer);
        called_next = true;
        connection.reset_transaction(() => {

            connection.setTLS({
                cipher: cipher,
                verified: verified,
                authorizationError: verifyErr,
                peerCertificate: cert,
            });

            connection.results.add(plugin, connection.tls);
            plugin.emit_upgrade_msg(connection, verified, verifyErr, cert, cipher);
            return next(OK);  // Return OK as we responded to the client
        })
    })
}

exports.hook_disconnect = function (next, connection) {
    if (connection.notes.cleanUpDisconnect) {
        connection.notes.cleanUpDisconnect(true);
    }
    return next();
}

exports.emit_upgrade_msg = function (conn, verified, verifyErr, cert, cipher) {
    let plugin = this;
    let msg = 'secured:';
    if (cipher) {
        msg += ` cipher=${cipher.name} version=${cipher.version}`;
    }
    msg += ` verified=${verified}`;
    if (verifyErr) msg += ` error="${verifyErr}"`;
    if (cert) {
        if (cert.subject) {
            msg += ` cn="${cert.subject.CN}" organization="${cert.subject.O}"`;
        }
        if (cert.issuer)      msg += ` issuer="${cert.issuer.O}"`;
        if (cert.valid_to)    msg += ` expires="${cert.valid_to}"`;
        if (cert.fingerprint) msg += ` fingerprint=${cert.fingerprint}`;
    }

    conn.loginfo(plugin,  msg);
    return msg;
}
