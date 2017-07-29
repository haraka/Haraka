'use strict';
/*----------------------------------------------------------------------------------------------*/
/* Obtained and modified from http://js.5sh.net/starttls.js on 8/18/2011.                       */
/*----------------------------------------------------------------------------------------------*/

var tls       = require('tls');
var util      = require('util');
var net       = require('net');
var stream    = require('stream');
var log       = require('./logger');
var EventEmitter = require('events');

var ocsp;
try {
    ocsp = require('ocsp');
}
catch (er) {
    log.lognotice("Can't load module ocsp. OCSP Stapling not available.");
}

// provides a common socket for attaching
// and detaching from either main socket, or crypto socket
class pluggableStream extends stream.Stream {
    constructor (socket) {
        super();
        this.readable = this.writable = true;
        this._timeout = 0;
        this._keepalive = false;
        this._writeState = true;
        this._pending = [];
        this._pendingCallbacks = [];
        if (socket) this.attach(socket);
    }
}

pluggableStream.prototype.pause = function () {
    if (this.targetsocket.pause) {
        this.targetsocket.pause();
        this.readable = false;
    }
};

pluggableStream.prototype.resume = function () {
    if (this.targetsocket.resume) {
        this.readable = true;
        this.targetsocket.resume();
    }
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
        self.writable = self.targetsocket.writable;
        self.emit('end');
    });
    self.targetsocket.on('close', function (had_error) {
        self.writable = self.targetsocket.writable;
        self.emit('close', had_error);
    });
    self.targetsocket.on('drain', function () {
        self.emit('drain');
    });
    self.targetsocket.once('error', function (exception) {
        self.writable = self.targetsocket.writable;
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
    this.targetsocket = {};
    this.targetsocket.write = function () {};
};

pluggableStream.prototype.write = function (data, encoding, callback) {
    if (this.targetsocket.write) {
        return this.targetsocket.write(data, encoding, callback);
    }
    return false;
};

pluggableStream.prototype.end = function (data, encoding) {
    if (this.targetsocket.end) {
        return this.targetsocket.end(data, encoding);
    }
};

pluggableStream.prototype.destroySoon = function () {
    if (this.targetsocket.destroySoon) {
        return this.targetsocket.destroySoon();
    }
};

pluggableStream.prototype.destroy = function () {
    if (this.targetsocket.destroy) {
        return this.targetsocket.destroy();
    }
};

pluggableStream.prototype.setKeepAlive = function (bool) {
    this._keepalive = bool;
    return this.targetsocket.setKeepAlive(bool);
};

pluggableStream.prototype.setNoDelay = function (/* true||false */) {
};

pluggableStream.prototype.unref = function () {
    return this.targetsocket.unref();
};

pluggableStream.prototype.setTimeout = function (timeout) {
    this._timeout = timeout;
    return this.targetsocket.setTimeout(timeout);
};

function pipe (cleartext, socket) {
    cleartext.socket = socket;

    function onerror (e) {
    }

    function onclose () {
        socket.removeListener('error', onerror);
        socket.removeListener('close', onclose);
    }

    socket.on('error', onerror);
    socket.on('close', onclose);
}

class pseudoTLSServer extends EventEmitter {
    constructor () {
        super();
    }
}

if (ocsp) {

    var ocspCache = new ocsp.Cache();
    var pseudoServ = new pseudoTLSServer();

    pseudoServ.on('OCSPRequest', function (cert, issuer, cb2) {
        ocsp.getOCSPURI(cert, function (err, uri) {
            log.logdebug('OCSP Request, URI: ' + uri + ', err=' +err);
            if (err) {
                return cb2(err);
            }
            if (uri === null) {   // not working OCSP server
                return cb2();
            }

            var req = ocsp.request.generate(cert, issuer);
            var options = {
                url: uri,
                ocsp: req.data
            };

            // look for a cached value first
            ocspCache.probe(req.id, function (_x, result) {
                log.logdebug('OCSP cache result: ' + util.inspect(result));
                if (result) {
                    cb2(_x, result.response);
                } else {
                    log.logdebug('OCSP req:' + util.inspect(req));
                    ocspCache.request(req.id, options, cb2);
                }
            });
        });
    });

    exports.shutdown = function () {
        log.logdebug('Cleaning ocspCache. How many keys? ' + Object.keys(ocspCache.cache).length);
        Object.keys(ocspCache.cache).forEach(function (key) {
            var e = ocspCache.cache[key];
            clearTimeout(e.timer);
        });
    };
}

exports.ocsp = ocsp;

function _getSecureContext (options) {
    if (options === undefined) options = {};

    if (options.requestCert === undefined) options.requestCert = true;

    if (options.rejectUnauthorized === undefined) {
        options.rejectUnauthorized = false;
    }

    if (!options.sessionIdContext) options.sessionIdContext = 'haraka';
    // if (!options.sessionTimeout) options.sessionTimeout = 1;

    return tls.createSecureContext(options);
}

function createServer (cb) {
    var serv = net.createServer(function (cryptoSocket) {

        var socket = new pluggableStream(cryptoSocket);

        socket.upgrade = function (options, cb2) {
            log.logdebug('Upgrading to TLS');

            socket.clean();
            cryptoSocket.removeAllListeners('data');

            if (!options) options = {};
            options.isServer = true;

            if (!options.secureContext) {
                options.secureContext = _getSecureContext(options);
            }

            if (options.enableOCSPStapling && ocsp) {
                options.server = pseudoServ;
                pseudoServ._sharedCreds = options.secureContext;
            }

            var cleartext = new tls.TLSSocket(cryptoSocket, options);

            pipe(cleartext, cryptoSocket);

            cleartext.on('error', function (exception) {
                socket.emit('error', exception);
            });

            cleartext.on('secure', function () {
                log.logdebug('TLS secured.');
                socket.emit('secure');
                if (cb2) cb2(cleartext.authorized,
                    cleartext.authorizationError,
                    cleartext.getPeerCertificate(),
                    cleartext.getCipher()
                );
            });

            socket.cleartext = cleartext;

            if (socket._timeout) {
                cleartext.setTimeout(socket._timeout);
            }

            cleartext.setKeepAlive(socket._keepalive);

            socket.attach(socket.cleartext);
        };

        cb(socket);
    });

    return serv;
}

function connect (port, host, cb) {
    var conn_options = {};
    if (typeof port === 'object') {
        conn_options = port;
        cb = host;
    }
    else {
        conn_options.port = port;
        conn_options.host = host;
    }

    var cryptoSocket = net.connect(conn_options);

    var socket = new pluggableStream(cryptoSocket);

    socket.upgrade = function (options, cb2) {
        socket.clean();
        cryptoSocket.removeAllListeners('data');

        if (!options) options = {};

        options.secureContext = _getSecureContext(options);
        options.socket = cryptoSocket;

        var cleartext = new tls.connect(options);

        pipe(cleartext, cryptoSocket);

        cleartext.on('error', function (err) {
            if (err.reason) {
                log.logerror("client TLS error: " + err);
            }
        })

        cleartext.on('secureConnect', function () {
            log.logdebug('client TLS secured.');
            if (cb2) cb2(
                cleartext.authorized,
                cleartext.authorizationError,
                cleartext.getPeerCertificate(),
                cleartext.getCipher()
            );
        });

        socket.cleartext = cleartext;

        if (socket._timeout) {
            cleartext.setTimeout(socket._timeout);
        }

        cleartext.setKeepAlive(socket._keepalive);

        socket.attach(socket.cleartext);

        log.logdebug('client TLS upgrade in progress, awaiting secured.');
    }

    return socket;
}

exports.connect = connect;
exports.createConnection = connect;
exports.Server = createServer;
exports.createServer = createServer;
