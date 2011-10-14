// Enables TLS. This is built into the server anyway, but enabling this plugin
// just advertises it.

var utils = require('./utils');

// To create a key:
// openssl req -x509 -nodes -days 2190 -newkey rsa:1024 \
//         -keyout config/tls_key.pem -out config/tls_cert.pem

exports.hook_capabilities = function (next, connection) {
    /* Caution: We cannot advertise STARTTLS if the upgrade has already been done. */
    if (connection.notes.tls_enabled !== 1) {
        connection.capabilities.push('STARTTLS');
        connection.notes.tls_enabled = 1;
    }
    /* Let the plugin chain continue. */
    next();
};

exports.hook_unrecognized_command = function (next, connection, params) {
    /* Watch for STARTTLS directive from client. */
    if (params[0] === 'STARTTLS') {
        var key = this.config.get('tls_key.pem', 'data').join("\n");
        var cert = this.config.get('tls_cert.pem', 'data').join("\n");
        var options = { key: key, cert: cert };

        /* Respond to STARTTLS command. */
        connection.respond(220, "Go ahead.");
        /* Upgrade the connection to TLS. */
        connection.client.upgrade(options); // Use the options which were saved by starttls.createServer().
        /* Force the startup protocol to repeat. */
        connection.uuid = utils.uuid();
        connection.reset_transaction();
        connection.hello_host = undefined;
        connection.using_tls = true;
        /* Return OK since we responded to the client. */
        return next(OK);
    }
    /* Let the plugin chain continue. */
    next();
};
