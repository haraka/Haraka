// Bridge AUTH requests to SMTP server

const net = require('node:net')
const { isNativeError } = require('node:util').types

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
    // a bare IPv6 literal like 2001:db8::1:25 is ambiguous as host:port
    const ep = net.isIPv6(host)
        ? new net_utils.Endpoint({ host, port: port || 25 })
        : net_utils.endpoint(host, port || 25)
    if (isNativeError(ep)) {
        connection.logerror(this, `invalid host: ${ep.message}`)
        return cb(false)
    }
    this.try_auth_proxy(connection, `${ep}`, user, passwd, cb)
}
