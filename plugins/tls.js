// TLS is built into Haraka. Enabling this plugin advertises STARTTLS.
// see 'haraka -h tls' for help

var utils = require('./utils');

// To create a key:
// openssl req -x509 -nodes -days 2190 -newkey rsa:2048 \
//         -keyout config/tls_key.pem -out config/tls_cert.pem

exports.register = function () {
    var plugin = this;

    plugin.tls_key = this.config.get('tls_key.pem', 'binary');
    if (!plugin.tls_key) {
        plugin.logcrit("TLS enabled but config/tls_key.pem not found. See 'haraka -h tls'");
        return;
    }

    plugin.tls_cert = plugin.config.get('tls_cert.pem', 'binary');
    if (!plugin.tls_key) {
        plugin.logcrit("TLS enabled but config/tls_cert.pem not found. See 'haraka -h tls'");
        return;
    }

    plugin.register_hook('capabilities', 'capabilities');
    plugin.register_hook('unrecognized_command', 'unrecognized_command');
};

exports.capabilities = function (next, connection) {

    /* Caution: We cannot advertise STARTTLS if the upgrade has already been done. */
    if (connection.using_tls) {
        return next();
    }

    connection.capabilities.push('STARTTLS');
    connection.notes.tls_enabled = 1;

    /* Let the plugin chain continue. */
    next();
};

exports.unrecognized_command = function (next, connection, params) {
    var plugin = this;
    /* Watch for STARTTLS directive from client. */
    if (params[0] !== 'STARTTLS') { return next; }

    if (!connection.notes.tls_enabled) { return next(); }

    var options = {
        key: plugin.tls_key,
        cert: plugin.tls_cert,
        requestCert: true,
    };

    /* Respond to STARTTLS command. */
    connection.respond(220, "Go ahead.");

    /*
    var timer = setTimeout(function () {
        connection.logerror(plugin, 'tls timeout');
        return next();
    }, 10 * 1000);
    */

    /* Upgrade the connection to TLS. */
    connection.client.upgrade(options, function (authorized, verifyError, cert, cipher) {
        // clearTimeout(timer);
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
