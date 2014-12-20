// TLS is built into Haraka. Enabling this plugin advertises STARTTLS.
// see 'haraka -h tls' for help

var utils = require('./utils');

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
    plugin.cfg = plugin.config.get('tls.ini', {
        booleans: [
            '+main.requestCert',
            '-main.rejectUnauthorized',
        ]
    }, function () {
        plugin.load_tls_ini();
    });

    if (!plugin.cfg.no_tls_hosts) {
        plugin.cfg.no_tls_hosts = {};
    }

    var config_options = ['ciphers','requestCert','rejectUnauthorized'];

    for (var i = 0; i < config_options.length; i++) {
        var opt = config_options[i];
        if (plugin.cfg.main[opt] === undefined) { continue; }
        plugin.tls_opts[opt] = plugin.cfg.main[opt];
    }
};

exports.tls_capabilities = function (next, connection) {
    /* Caution: do not advertise STARTTLS if already TLS upgraded */
    if (connection.using_tls) { return next(); }

    var plugin = this;
    
    if (plugin.cfg.no_tls_hosts[connection.remote_ip]) {
        return next();
    }

    connection.capabilities.push('STARTTLS');
    connection.notes.tls_enabled = 1;

    /* Let the plugin chain continue. */
    next();
};

exports.tls_unrecognized_command = function (next, connection, params) {
    /* Watch for STARTTLS directive from client. */
    if (!connection.notes.tls_enabled) { return next(); }
    if (params[0].toUpperCase() !== 'STARTTLS') { return next(); }

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
