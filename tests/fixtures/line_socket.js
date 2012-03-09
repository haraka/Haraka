"use strict";

var stub = require('tests/fixtures/stub');

function Socket() {
    if (!(this instanceof Socket)) return new Socket();
    var self = this;
    self.setTimeout = stub();
    self.removeAllListeners = stub();
}

exports.Socket = Socket;

// New interface - uses TLS
exports.connect = function (port, host, cb) {
    var sock = new Socket();
    return sock;
}
