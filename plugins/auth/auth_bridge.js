// Bridge AUTH requests to SMTP server

exports.register = function () {
    this.inherits('auth/auth_proxy');
    this.load_flat_ini();
}

exports.load_flat_ini = function () {
    this.cfg = this.config.get('smtp_bridge.ini', () => {
        this.load_flat_ini();
    });
}

exports.check_plain_passwd = function (connection, user, passwd, cb) {
    let { host } = this.cfg.main;
    if (this.cfg.main.port) {
        host = `${host}:${this.cfg.main.port}`;
    }
    this.try_auth_proxy(connection, host, user, passwd, cb);
}
