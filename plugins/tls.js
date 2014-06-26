// TLS is built into Haraka. Enabling this plugin advertises STARTTLS.
// see 'haraka -h tls' for help

var utils = require('./utils');

// To create a key:
// openssl req -x509 -nodes -days 2190 -newkey rsa:2048 \
//         -keyout config/tls_key.pem -out config/tls_cert.pem

exports.register = function () {
    var plugin = this;

    plugin.tls_opts = {
        key: false,
        cert: false,
    };

    var config_options = ['ciphers','requestCert','rejectUnauthorized'];

    var load_config = function () {
        plugin.loginfo("loading tls.ini");
        plugin.cfg = plugin.config.get('tls.ini', {
            booleans: [
                '+main.requestCert',
                '-main.rejectUnauthorized',
            ]
        }, load_config);

        for (var i in config_options) {
            if (plugin.cfg.main[config_options[i]] === undefined) { continue; }
            plugin.tls_opts[config_options[i]] = plugin.cfg.main[config_options[i]];
        }
    };
    load_config();

    var load_key = function () {
        plugin.loginfo("loading tls_key.pem");
        plugin.tls_opts.key = plugin.config.get('tls_key.pem', 'binary', load_key);
        if (!plugin.tls_opts.key) {
            plugin.logcrit("config/tls_key.pem not loaded. See 'haraka -h tls'");
        }
    };
    load_key();

    var load_cert = function () {
        plugin.loginfo("loading tls_cert.pem");
        plugin.tls_opts.cert = plugin.config.get('tls_cert.pem', 'binary', load_cert);
        if (!plugin.tls_opts.cert) {
            plugin.logcrit("config/tls_cert.pem not loaded. See 'haraka -h tls'");
        }
    };
    load_cert();
    plugin.logdebug(plugin.tls_opts);
};

exports.hook_capabilities = function (next, connection) {
    /* Caution: do not advertise STARTTLS if the upgrade has already been done. */
    if (connection.using_tls) { return next(); }

    var plugin = this;
    if (plugin.cfg.no_tls_hosts) {
        if (plugin.cfg.no_tls_hosts[connection.remote_ip]) {
            return next();
        }
    }

    if (!plugin.tls_opts.key) {
        connection.logcrit("No TLS key found. See 'harka -h tls'");
        return next();
    }

    if (!plugin.tls_opts.cert) {
        connection.logcrit("No TLS cert found. See 'harka -h tls'");
        return next();
    }

    connection.capabilities.push('STARTTLS');
    connection.notes.tls_enabled = 1;

    /* Let the plugin chain continue. */
    next();
};

exports.hook_unrecognized_command = function (next, connection, params) {
    /* Watch for STARTTLS directive from client. */
    if (!connection.notes.tls_enabled) { return next(); }
    if (params[0] !== 'STARTTLS') { return next(); }

    /* Respond to STARTTLS command. */
    connection.respond(220, "Go ahead.");

    var plugin = this;
    // adjust plugin.timeout like so: echo '45' > config/tls.timeout
    var timeout = plugin.timeout - 1;

    var timer = setTimeout(function () {
        connection.logerror(plugin, 'timeout');
        return next(DENYSOFTDISCONNECT);
    }, timeout * 1000);

    /* Upgrade the connection to TLS. */
    connection.client.upgrade(plugin.tls_opts, function (authorized, verifyError, cert, cipher) {
        clearTimeout(timer);
        connection.reset_transaction(function () {
            connection.hello_host = undefined;
            connection.using_tls = true;
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
    });
};
