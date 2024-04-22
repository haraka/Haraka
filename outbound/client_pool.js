'use strict';

const utils        = require('haraka-utils');

const sock         = require('../line_socket');
const logger       = require('../logger');

const obc          = require('./config');

exports.name = 'outbound'

function _create_socket (name, port, host, localAddress, is_unix_socket, callback) {

    const socketArgs = is_unix_socket ? {path: host} : {port, host, localAddress};
    const socket = socket.connect(socketArgs);
    socket.name = name;
    socket.__uuid = utils.uuid();
    socket.setTimeout(obc.cfg.connect_timeout * 1000);
    logger.debug(exports, `created. host: ${host} port: ${port}`, { uuid: socket.__uuid });
    socket.once('connect', () => {
        socket.removeAllListeners('error'); // these get added after callback
        socket.removeAllListeners('timeout');
        callback(null, socket);
    });
    socket.once('error', err => {
        socket.end();
        socket.removeAllListeners();
        socket.destroy();
        callback(err.message, null);
    });
    socket.once('timeout', () => {
        socket.end();
        socket.removeAllListeners();
        socket.destroy();
        callback(`connection timed out to ${host}:${port}`, null);
    });
}

// Get a socket for the given attributes.
exports.get_client = function (port = 25, host = 'localhost', local_addr, is_unix_socket, callback) {
    _create_socket(
        `outbound::${port}:${host}:${local_addr}`,
        ...arguments
    )
}

exports.release_client = (socket, port, host, local_addr, error) => {
    let logMsg = `release_client: ${socket.__uuid} ${host}:${port}`
    if (local_addr) logMsg += ` from ${local_addr}`
    logger.debug(exports, logMsg);
    socket.removeAllListeners();
    socket.destroy();
}
