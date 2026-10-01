// Bridge AUTH requests to SMTP server

const net_utils = require('haraka-net-utils')

exports.register = function () {
    this.inherits('auth/auth_proxy')
    this.load_flat_ini()
}

exports.load_flat_ini = function () {
    this.cfg = this.config.get('smtp_bridge.ini', () => {
        this.load_flat_ini()
    })
}

exports.check_plain_passwd = function (connection, user, passwd, cb) {
    const { host, port } = this.cfg.main
    let ep
    try {
        ep = net_utils.Endpoint.parse(host, port || 25)
    } catch (err) {
        connection.logerror(this, `invalid host: ${err.message}`)
        return cb(false)
    }
    this.try_auth_proxy(connection, `${ep}`, user, passwd, cb)
}
