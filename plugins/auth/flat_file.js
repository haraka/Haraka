// Auth against a flat file

exports.register = function () {
    this.inherits('auth/auth_base');
    this.load_flat_ini();
}

exports.load_flat_ini = function () {
    this.cfg = this.config.get('auth_flat_file.ini', () => {
        this.load_flat_ini();
    });
}

exports.hook_capabilities = function (next, connection) {
    // don't allow AUTH unless private IP or encrypted
    if (!connection.remote.is_private && !connection.tls.enabled) {
        connection.logdebug(this,
            "Auth disabled for insecure public connection");
        return next();
    }

    let methods = null;
    if (this.cfg.core && this.cfg.core.methods ) {
        methods = this.cfg.core.methods.split(',');
    }
    if (methods && methods.length > 0) {
        connection.capabilities.push(`AUTH ${methods.join(' ')}`);
        connection.notes.allowed_auth_methods = methods;
    }
    next();
}

exports.get_plain_passwd = function (user, connection, cb) {
    if (this.cfg.users[user]) {
        return cb(this.cfg.users[user].toString());
    }
    return cb();
}
