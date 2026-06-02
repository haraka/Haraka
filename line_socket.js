'use strict'
// Back-compat shim. The Socket class lives in haraka-net-utils as LineSocket;
// the line-processing helper is `add_line_processor` there. The connect()
// helper stays here because it depends on Haraka's tls_socket.

const { LineSocket, add_line_processor } = require('haraka-net-utils')

const tls_socket = require('./tls_socket')

exports.Socket = LineSocket

// New interface - uses TLS
exports.connect = (port, host) => {
    let options = {}
    if (typeof port === 'object') {
        options = port
    } else {
        options.port = port
        options.host = host
    }
    const sock = tls_socket.connect(options)
    add_line_processor(sock)
    return sock
}
