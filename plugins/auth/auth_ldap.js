// auth/auth_ldap

const ldap  = require('ldapjs');
const async = require('async');

exports.hook_capabilities = function (next, connection) {
    // Don't offer AUTH capabilities by default unless session is encrypted
    if (connection.tls.enabled) {
        const methods = [ 'LOGIN' ];
        connection.capabilities.push('AUTH ' + methods.join(' '));
        connection.notes.allowed_auth_methods = methods;
    }
    next();
}

exports.register = function () {
    this.inherits('auth/auth_base');
}

exports.check_plain_passwd = function (connection, user, passwd, cb) {
    // Get LDAP config
    const config = this.config.get('auth_ldap.ini');
    let ldap_url = 'ldap://127.0.0.1';
    if (config.core.server) {
        ldap_url = config.core.server;
    }
    const rejectUnauthorized = (config.core.rejectUnauthorized != undefined) ?
        config.core.rejectUnauthorized : true;

    const client = ldap.createClient({
        url: ldap_url,
        timeout: (config.core.timeout != undefined) ? config.core.timeout : 5000,
        tlsOptions: {
            rejectUnauthorized: rejectUnauthorized
        }
    });

    client.on('error', function (err) {
        connection.loginfo('auth_ldap: client error ' + err.message);
        cb(false);
    });

    config.dns = Object.keys(config.dns).map(function (v) {
        return config.dns[v];
    })
    async.detectSeries(config.dns, function (dn, callback) {
        dn = dn.replace(/%u/g, user);
        client.bind(dn, passwd, function (err) {
            if (err) {
                connection.loginfo("auth_ldap: (" + dn + ") " + err.message);
                return callback(false);
            }
            else {
                client.unbind();
                return callback(true);
            }
        })
    }, function (result) {
        cb(result);
    });
}

