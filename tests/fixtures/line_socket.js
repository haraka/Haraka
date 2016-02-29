'use strict';

var events   = require('events');
var util     = require('util');
var fixtures = require('haraka-test-fixtures');
var stub     = fixtures.stub.stub;

function Socket (port, host) {
    events.EventEmitter.call(this);
    this.port = port;
    this.host = host;
    this.setTimeout = stub();
    this.setKeepAlive = stub();
    this.destroy = stub();
}

util.inherits(Socket, events.EventEmitter);

exports.Socket = Socket;

exports.connect = function (port, host, cb) {
    return new Socket(port, host);
}
