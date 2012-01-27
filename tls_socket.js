"use strict";
/*----------------------------------------------------------------------------------------------*/
/* Obtained and modified from http://js.5sh.net/starttls.js on 8/18/2011.                       */
/*----------------------------------------------------------------------------------------------*/

var tls = require('tls');
var crypto = require('crypto');
var util = require('util');
var net = require('net');
var events = require('events');
var stream = require('stream');
var log = require('./logger');

// provides a common socket for attaching
// and detaching from either main socket, or crypto socket
function pluggableStream(socket) {
    stream.Stream.call(this);
    this.readable = this.writable = true;
    this._writeState = true;
    this._pending = [];
    this._pendingCallbacks = [];
    if (socket)
        this.attach(socket);
}

util.inherits(pluggableStream, stream.Stream);
util.inherits(pluggableStream, events.EventEmitter);

pluggableStream.prototype.pipe = function    (socket) {
    this.on('data', function (data) {
        if (socket.write)
            socket.write(data);
    });
};

pluggableStream.prototype.attach = function (socket) {
    var self = this;
    self.targetsocket = socket;
    self.targetsocket.on('data', function (data) {
        self.emit('data', data);
    });
    self.targetsocket.on('connect', function (a, b) {
        self.emit('connect', a, b);
    });
    self.targetsocket.on('secureConnection', function (a, b) {
        self.emit('secureConnection', a, b);
        self.emit('secure', a, b);
    });
    self.targetsocket.on('secure', function (a, b) {
        self.emit('secureConnection', a, b);
        self.emit('secure', a, b);
    });
    self.targetsocket.on('end', function () {
        self.emit('end');
    });
    self.targetsocket.on('close', function () {
        self.emit('close');
    });
    self.targetsocket.on('drain', function () {
        self.emit('drain');
    });
    self.targetsocket.on('error', function (exception) {
        self.emit('error', exception);
    });
    self.targetsocket.on('timeout', function () {
        self.emit('timeout');
    });
    if (self.targetsocket.remotePort) {
        self.remotePort = self.targetsocket.remotePort;
    }

    if (self.targetsocket.remoteAddress) {
        self.remoteAddress = self.targetsocket.remoteAddress;
    }

};

pluggableStream.prototype.clean = function (data) {
    if (this.targetsocket && this.targetsocket.removeAllListeners) {
        this.targetsocket.removeAllListeners('data');
        this.targetsocket.removeAllListeners('secureConnection');
        this.targetsocket.removeAllListeners('secure');
        this.targetsocket.removeAllListeners('end');
        this.targetsocket.removeAllListeners('close');
        this.targetsocket.removeAllListeners('error');
        this.targetsocket.removeAllListeners('drain');
    }
    ;
    this.targetsocket = {};
    this.targetsocket.write = function () {
    };
};

pluggableStream.prototype.write = function (data) {
    if (this.targetsocket.write) {
        return this.targetsocket.write(data);
    }
    return false;
};

pluggableStream.prototype.end = function () {
    if (this.targetsocket.end) {
        return this.targetsocket.end();
    }
}

pluggableStream.prototype.destroySoon = function () {
    if (this.targetsocket.destroySoon) {
        return this.targetsocket.destroySoon();
    }
}

pluggableStream.prototype.destroy = function () {
    if (this.targetsocket.destroy) {
        return this.targetsocket.destroy();
    }
}

pluggableStream.prototype.setKeepAlive = function (/* true||false, timeout */) {
};

pluggableStream.prototype.setNoDelay = function (/* true||false */) {
};

pluggableStream.prototype.setTimeout = function (timeout) {
    return this.targetsocket.setTimeout(timeout);
};

function pipe(pair, socket) {
    pair.encrypted.pipe(socket);
    socket.pipe(pair.encrypted);

    pair.fd = socket.fd;
    var cleartext = pair.cleartext;
    cleartext.socket = socket;
    cleartext.encrypted = pair.encrypted;
    cleartext.authorized = false;

    function onerror(e) {
        if (cleartext._controlReleased) {
            cleartext.emit('error', e);
        }
    }

    function onclose() {
        socket.removeListener('error', onerror);
        socket.removeListener('close', onclose);
    }

    socket.on('error', onerror);
    socket.on('close', onclose);

    return cleartext;
}

function createServer(cb) {
    var serv = net.createServer(function (cryptoSocket) {

        var socket = new pluggableStream(cryptoSocket);

        socket.upgrade = function (options) {
            log.logdebug("Upgrading to TLS");
            
            socket.clean();
            cryptoSocket.removeAllListeners('data');
            var sslcontext = crypto.createCredentials(options);

            var pair = tls.createSecurePair(sslcontext, true, false, false);

            var cleartext = pipe(pair, cryptoSocket);

            pair.on('secure', function() {
                var verifyError = (pair.ssl || pair._ssl).verifyError();

                log.logdebug("TLS secured.");
                if (verifyError) {
                    cleartext.authorized = false;
                    cleartext.authorizationError = verifyError;
                } else {
                    cleartext.authorized = true;
                }

                socket.emit('secure');
            });

            cleartext._controlReleased = true;

            socket.cleartext = cleartext;

            socket.attach(socket.cleartext);
        };

        cb(socket);
    });

    return serv;
}

function connect(port, host, cb) {
    var cryptoSocket = new net.Socket();

    cryptoSocket.connect(port, host);

    var socket = new pluggableStream(cryptoSocket);

    socket.upgrade = function (options) {
        socket.clean();
        cryptoSocket.removeAllListeners('data');
        var sslcontext = crypto.createCredentials(options);

        var pair = tls.createSecurePair(sslcontext, false);

        socket.pair = pair;

        var cleartext = pipe(pair, cryptoSocket);
        
        pair.on('secure', function() {
            var verifyError = (pair.ssl || pair._ssl).verifyError();

            log.logdebug("client TLS secured.");
            if (verifyError) {
                cleartext.authorized = false;
                cleartext.authorizationError = verifyError;
            } else {
                cleartext.authorized = true;
            }

            if (cb) cb();

            socket.emit('secure');
        });

        cleartext._controlReleased = true;
        socket.cleartext = cleartext;
        socket.attach(socket.cleartext);

        log.logdebug("client TLS upgrade in progress, awaiting secured.");
    };

    return (socket);
}

exports.connect = connect;
exports.createConnection = connect;
exports.Server = createServer;
exports.createServer = createServer;