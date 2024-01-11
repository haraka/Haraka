// Auth against a flat file

exports.register = function () {
    this.inherits('auth/auth_base');
    this.load_flat_ini();

    if (this.cfg.core.constrain_sender) {
        this.register_hook('mail', 'constrain_sender')
    }
}

exports.load_flat_ini = function () {
    this.cfg = this.config.get('auth_flat_file.ini', {
        booleans: [
            '+core.constrain_sender',
        ]
    },
    () => {
        this.load_flat_ini();
    });

    if (this.cfg.users === undefined) this.cfg.users = {}
}

exports.hook_capabilities = function (next, connection) {
    if (!connection.remote.is_private && !connection.tls.enabled) {
        connection.logdebug(this, "Auth disabled for insecure public connection");
        return next();
    }

    const methods = this.cfg.core?.methods ? this.cfg.core.methods.split(',') : null
    if (methods && methods.length > 0) {
        connection.capabilities.push(`AUTH ${methods.join(' ')}`);
        connection.notes.allowed_auth_methods = methods;
    }
    next();
}

exports.get_plain_passwd = function (user, connection, cb) {
    if (this.cfg.users[user]) return cb(this.cfg.users[user].toString());

    cb();
}
