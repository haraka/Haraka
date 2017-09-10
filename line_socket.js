"use strict";
// A subclass of Socket which reads data by line

const net   = require('net');
const utils = require('haraka-utils');

const tls_socket = require('./tls_socket');

class Socket extends net.Socket {
    constructor (options) {
        super(options);
        setup_line_processor(this);
    }
}

function setup_line_processor (socket) {
    let current_data = '';
    socket.process_data = function (data) {
        current_data += data;
        let results;
        while ((results = utils.line_regexp.exec(current_data))) {
            const this_line = results[1];
            current_data = current_data.slice(this_line.length);
            socket.emit('line', this_line);
        }
    };

    socket.process_end = function () {
        if (current_data.length) {
            socket.emit('line', current_data);
        }
        current_data = '';
    };

    socket.on('data', function (data) { socket.process_data(data);});
    socket.on('end',  function ()     { socket.process_end();     });
}

exports.Socket = Socket;

// New interface - uses TLS
exports.connect = function (port, host, cb) {
    let options = {};
    if (typeof port === 'object') {
        options = port;
        cb = host;
    }
    else {
        options.port = port;
        options.host = host;
    }
    const sock = tls_socket.connect(options, cb);
    setup_line_processor(sock);
    return sock;
};
