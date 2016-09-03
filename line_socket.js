"use strict";
// A subclass of Socket which reads data by line

var net  = require('net');
var tls  = require('./tls_socket');
var util = require('util');
var line_regexp = require('./utils').line_regexp;

function Socket(options) {
    if (!(this instanceof Socket)) return new Socket(options);
    net.Socket.call(this, options);
    setup_line_processor(this);
}

function setup_line_processor (socket) {
    var current_data = '';
    socket.process_data = function (data) {
        current_data += data;
        var results;
        while (results = line_regexp.exec(current_data)) {
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

util.inherits(Socket, net.Socket);

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
