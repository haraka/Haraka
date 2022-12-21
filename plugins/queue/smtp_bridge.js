// Bridge to an SMTP server
// Overrides the MX and sets the same AUTH user and password

exports.register = function () {
    this.load_flat_ini();
}

exports.load_flat_ini = function () {
    this.cfg = this.config.get('smtp_bridge.ini', () => {
        this.load_flat_ini();
    });
}

exports.hook_data_post = (next, connection) => {
    const txn = connection?.transaction;
    if (!txn) return next();

    // Copy auth notes to transaction notes so they're available in hmail.todo.notes
    txn.notes.auth_user = connection.notes.auth_user;
    txn.notes.auth_passwd = connection.notes.auth_passwd;
    return next();
}

exports.hook_get_mx = function (next, hmail, domain) {
    const priority = this.cfg.main.priority ? this.cfg.main.priority : 10;
    const authType = this.cfg.main.auth_type ? this.cfg.main.auth_type : null;
    const port = this.cfg.main.port ? this.cfg.main.port : null;
    return next(OK, {
        priority,
        exchange: this.cfg.main.host,
        port,
        auth_type: authType,
        auth_user: hmail.todo.notes.auth_user,
        auth_pass: hmail.todo.notes.auth_passwd
    });
}
