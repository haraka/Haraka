'use strict';

const events   = require('events');
const fixtures = require('haraka-test-fixtures');
const stub     = fixtures.stub.stub;

class Socket extends events.EventEmitter {
    constructor (port, host) {
        super();
        this.port = port;
        this.host = host;
        this.setTimeout = stub();
        this.setKeepAlive = stub();
        this.destroy = stub();
    }
}

exports.Socket = Socket;

exports.connect = function (port, host, cb) {
    return new Socket(port, host);
}
