'use strict';

const utils = require('haraka-utils');
const net_utils = require('haraka-net-utils')

const tls_socket = require('../tls_socket');
const logger = require('../logger');
const obc  = require('./config');

exports.name = 'outbound'

// Get a socket for the given attributes.
exports.get_client = function (mx, callback) {
    const socketArgs = mx.path ? { path: mx.path } : { port: mx.port, host: mx.exchange, localAddress: mx.bind };

    const socket = tls_socket.connect(socketArgs);
    net_utils.add_line_processor(socket);

    socket.name = `outbound::${JSON.stringify(socketArgs)}`;
    socket.__uuid = utils.uuid();
    socket.setTimeout(obc.cfg.connect_timeout * 1000);

    logger.debug(exports, `created ${socket.name}`, { uuid: socket.__uuid });

    socket.once('connect', () => {
        socket.removeAllListeners('error'); // these get added after callback
        socket.removeAllListeners('timeout');
        callback(null, socket);
    })

    socket.once('error', err => {
        socket.end();
        socket.removeAllListeners();
        socket.destroy();
        callback(err.message, null);
    })

    socket.once('timeout', () => {
        socket.end();
        socket.removeAllListeners();
        socket.destroy();
        callback(`connection timed out to ${socket.name}`, null);
    })
}

exports.release_client = (socket, mx) => {
    let logMsg = `release_client: ${socket.name}`
    if (mx.bind) logMsg += ` from ${mx.bind}`
    logger.debug(exports, logMsg);
    socket.removeAllListeners();
    socket.destroy();
}
