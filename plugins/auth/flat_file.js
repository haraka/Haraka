// Auth against a flat file

exports.register = function () {
    this.inherits('auth/auth_base');
}

exports.hook_capabilities = function (next, connection) {
    var config = this.config.get('auth_flat_file.ini');
    var methods = (config.core && config.core.methods ) ? config.core.methods.split(',') : null;
    if(methods && methods.length > 0) {
        connection.capabilities.push('AUTH ' + methods.join(' '));
        connection.notes.allowed_auth_methods = methods;
    }
    next();
};

exports.get_plain_passwd = function (user, cb) {
    var config = this.config.get('auth_flat_file.ini');
    if (config.users[user]) {
        return cb(config.users[user]);
    }
    return cb();
}
