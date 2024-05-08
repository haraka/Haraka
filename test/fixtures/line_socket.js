'use strict';

const events   = require('node:events');
const fixtures = require('haraka-test-fixtures');
const { stub } = fixtures.stub;

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

exports.connect = (port, host, cb) => new Socket(port, host)
