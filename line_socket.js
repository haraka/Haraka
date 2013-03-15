"use strict";
// A subclass of Socket which reads data by line

var net  = require('net');
var tls  = require('./tls_socket');
var util = require('util');
var line_regexp = /^([^\n]*\n)/;

function Socket(options) {
    if (!(this instanceof Socket)) return new Socket(options);
    var self = this;
    net.Socket.call(this, options);
    setup_line_processor(this);
}

function setup_line_processor (self) {
    var current_data = '';
    self.process_data = function (data) {
        current_data += data;
        var results;
        while (results = line_regexp.exec(current_data)) {
            var this_line = results[1];
            current_data = current_data.slice(this_line.length);
            self.emit('line', this_line);
        }
    };

    self.process_end = function () {
        if (current_data.length)
            self.emit('line', current_data)
        current_data = '';
    };

    self.on('data', function (data) { self.process_data(data) });
    self.on('end',  function ()     { self.process_end()      });
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
}
