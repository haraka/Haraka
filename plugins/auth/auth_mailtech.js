/**
 * Created by som on 21/2/17.
 */


exports.register = function () {
    var plugin = this;
    plugin.inherits('auth/auth_base');
};

exports.hook_capabilities = function (next, connection) {
    var plugin = this;
    // don't allow AUTH unless private IP or encrypted
    if (!connection.remote.is_private && !connection.tls.enabled) {
        connection.logdebug(plugin,
            "Auth disabled for insecure public connection");
        return next();
    }

    var methods = ['PLAIN','LOGIN'];
    if (methods && methods.length > 0) {
        connection.capabilities.push('AUTH ' + methods.join(' '));
        connection.notes.allowed_auth_methods = methods;
    }
    next();
};

exports.check_plain_passwd = function (connection, user, passwd, cb) {
    return cb(true);
};

exports.check_cram_md5_passwd = function (connection, user, passwd, cb) {
    return cb(true);
};