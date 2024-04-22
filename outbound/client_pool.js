'use strict';

const utils        = require('haraka-utils');

const sock         = require('../line_socket');
const logger       = require('../logger');

const obc          = require('./config');

exports.name = 'outbound'

// Get a socket for the given attributes.
exports.get_client = function (port = 25, host = 'localhost', localAddress, is_unix_socket, callback) {

    const name = `outbound::${port}:${host}:${localAddress}`
    const socketArgs = is_unix_socket ? {path: host} : {port, host, localAddress};
    const socket = sock.connect(socketArgs);

    socket.name = name;
    socket.__uuid = utils.uuid();
    socket.setTimeout(obc.cfg.connect_timeout * 1000);

    logger.debug(exports, `created. host: ${host} port: ${port}`, { uuid: socket.__uuid });

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
        callback(`connection timed out to ${host}:${port}`, null);
    })
}

exports.release_client = (socket, port, host, local_addr, error) => {
    let logMsg = `release_client: ${socket.__uuid} ${host}:${port}`
    if (local_addr) logMsg += ` from ${local_addr}`
    logger.debug(exports, logMsg);
    socket.removeAllListeners();
    socket.destroy();
}
