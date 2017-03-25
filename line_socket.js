"use strict";
// A subclass of Socket which reads data by line

var net   = require('net');
var utils = require('haraka-utils');

var tls  = require('./tls_socket');

class Socket extends net.Socket {
    constructor (options) {
        super(options);
        setup_line_processor(this);
    }
}

function setup_line_processor (socket) {
    var current_data = '';
    socket.process_data = function (data) {
        current_data += data;
        var results;
        while ((results = utils.line_regexp.exec(current_data))) {
            var this_line = results[1];
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
    var options = {};
    if (typeof port === 'object') {
        options = port;
        cb = host;
    }
    else {
        options.port = port;
        options.host = host;
    }
    var sock = tls.connect(options, cb);
    setup_line_processor(sock);
    return sock;
};
