// Enables TLS. This is built into the server anyway, but enabling this plugin
// just advertises it.

var utils = require('./utils');

// To create a key:
// openssl req -x509 -nodes -days 2190 -newkey rsa:2048 \
//         -keyout config/tls_key.pem -out config/tls_cert.pem

exports.hook_capabilities = function (next, connection) {
    /* Caution: We cannot advertise STARTTLS if the upgrade has already been done. */
    if (!connection.using_tls) {
        var key = this.config.get('tls_key.pem', 'binary');
        if (key) {
            connection.capabilities.push('STARTTLS');
            connection.notes.tls_enabled = 1;
        }
        else {
            connection.logcrit("TLS plugin enabled but no key found. Please see plugin docs.");
        }
    }
    /* Let the plugin chain continue. */
    next();
};

exports.hook_unrecognized_command = function (next, connection, params) {
    /* Watch for STARTTLS directive from client. */
    if (connection.notes.tls_enabled && params[0] === 'STARTTLS') {
        var key = this.config.get('tls_key.pem', 'binary');
        var cert = this.config.get('tls_cert.pem', 'binary');
        var options = { key: key, cert: cert, requestCert: true };

        /* Respond to STARTTLS command. */
        connection.respond(220, "Go ahead.");
        /* Upgrade the connection to TLS. */
        var self = this;
        connection.client.upgrade(options, function (authorized, verifyError, cert, cipher) {
            connection.reset_transaction(function () {
                connection.hello_host = undefined;
                connection.using_tls = true;
                connection.notes.tls = { 
                    authorized: authorized,
                    authorizationError: verifyError,
                    peerCertificate: cert,
                    cipher: cipher
                };
                connection.loginfo(self, 'secured:' +
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
    }
    else {
        return next();
    }
};
