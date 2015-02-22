// Auth against a flat file
var net_utils = require('./net_utils');

exports.register = function () {
    var plugin = this;
    plugin.inherits('auth/auth_base');
    plugin.load_flat_ini();
};

exports.load_flat_ini = function () {
    var plugin = this;
    plugin.cfg = plugin.config.get('auth_flat_file.ini', function () {
        plugin.load_flat_ini();
    });
};

exports.hook_capabilities = function (next, connection) {
    var plugin = this;
    // don't allow AUTH unless private IP or encrypted
    if (!net_utils.is_private_ip(connection.remote_ip) && !connection.using_tls) {
        connection.logdebug(plugin,
                "Auth disabled for insecure public connection");
        return next();
    }

    var methods = null;
    if (plugin.cfg.core && plugin.cfg.core.methods ) {
        methods = plugin.cfg.core.methods.split(',');
    }
    if (methods && methods.length > 0) {
        connection.capabilities.push('AUTH ' + methods.join(' '));
        connection.notes.allowed_auth_methods = methods;
    }
    next();
};

exports.get_plain_passwd = function (user, cb) {
    var plugin = this;
    if (plugin.cfg.users[user]) {
        return cb(plugin.cfg.users[user]);
    }
    return cb();
};
