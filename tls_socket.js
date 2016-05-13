'use strict';
/*----------------------------------------------------------------------------------------------*/
/* Obtained and modified from http://js.5sh.net/starttls.js on 8/18/2011.                       */
/*----------------------------------------------------------------------------------------------*/

var tls       = require('tls');
var constants = require('constants');
var crypto    = require('crypto');
var util      = require('util');
var net       = require('net');
var stream    = require('stream');
var log       = require('./logger');
var config    = require('./config');
var ipaddr    = require('ipaddr.js');

// provides a common socket for attaching
// and detaching from either main socket, or crypto socket
function pluggableStream(socket) {
    stream.Stream.call(this);
    this.readable = this.writable = true;
    this._timeout = 0;
    this._keepalive = false;
    this._writeState = true;
    this._pending = [];
    this._pendingCallbacks = [];
    if (socket) this.attach(socket);
}

util.inherits(pluggableStream, stream.Stream);

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
    self.targetsocket.on('error', function (exception) {
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

pluggableStream.prototype.setTimeout = function (timeout) {
    this._timeout = timeout;
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

        socket.upgrade = function (options, cb2) {
            log.logdebug('Upgrading to TLS');

            socket.clean();
            cryptoSocket.removeAllListeners('data');

            // Set SSL_OP_ALL for maximum compatibility with broken clients
            // See http://www.openssl.org/docs/ssl/SSL_CTX_set_options.html
            if (!options) options = {};
            // TODO: bug in Node means we can't do this until it's fixed
            // options.secureOptions = constants.SSL_OP_ALL;

            // Setting secureProtocol to 'SSLv23_method' and secureOptions to
            // constants.SSL_OP_NO_SSLv2/3 are used to disable SSLv2 and SSLv3
            // protocol support, to prevent DROWN and POODLE attacks at least.
            // Node's docs here are super unhelpful, e.g.
            // <https://nodejs.org/api/tls.html#tls_tls_createserver_options_secureconnectionlistener>
            // doesn't even mention secureOptions.  Some digging reveals the
            // relevant openssl docs: secureProtocol is documented in
            // <https://www.openssl.org/docs/manmaster/ssl/ssl.html#DEALING-WITH-PROTOCOL-METHODS>,
            // (note: you'll want to select the correct openssl version that
            // node was compiled against, instead of master), and secureOptions
            // are documented in
            // <https://www.openssl.org/docs/manmaster/ssl/SSL_CTX_set_options.html>
            // (again, select the appropriate openssl version, not master).
            // One caveat: it doesn't seem like all options are actually
            // compiled into node.  To see which ones are, fire up node and
            // examine the object returned by require('constants').

            options.secureProtocol = options.secureProtocol || 'SSLv23_method';
            options.secureOptions = options.secureOptions |
                    constants.SSL_OP_NO_SSLv2 | constants.SSL_OP_NO_SSLv3;

            var requestCert = true;
            var rejectUnauthorized = false;
            if (options) {
                if (options.requestCert !== undefined) {
                    requestCert = options.requestCert;
                }
                if (options.rejectUnauthorized !== undefined) {
                    rejectUnauthorized = options.rejectUnauthorized;
                }
            }
            var sslcontext = (tls.createSecureContext || crypto.createCredentials)(options);

            // tls.createSecurePair(credentials, isServer, requestCert, rejectUnauthorized)
            var pair = tls.createSecurePair(sslcontext, true, requestCert, rejectUnauthorized);

            var cleartext = pipe(pair, cryptoSocket);

            pair.on('error', function(exception) {
                socket.emit('error', exception);
            });

            pair.on('secure', function() {
                var verifyError = (pair.ssl || pair._ssl).verifyError();

                log.logdebug('TLS secured.');
                if (verifyError) {
                    cleartext.authorized = false;
                    cleartext.authorizationError = verifyError;
                }
                else {
                    cleartext.authorized = true;
                }
                var cert = pair.cleartext.getPeerCertificate();
                if (pair.cleartext.getCipher) {
                    var cipher = pair.cleartext.getCipher();
                }
                socket.emit('secure');
                if (cb2) cb2(cleartext.authorized, verifyError, cert, cipher);
            });

            cleartext._controlReleased = true;

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

if (require('semver').gt(process.version, '0.7.0')) {
    var _net_connect = function (options) {
        return net.connect(options);
    };
}
else {
    var _net_connect = function (options) {
        return net.connect(options.port, options.host);
    };
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

    var cryptoSocket = _net_connect(conn_options);

    var socket = new pluggableStream(cryptoSocket);

    socket.upgrade = function (options, cb2) {
        socket.clean();
        cryptoSocket.removeAllListeners('data');

        // Set SSL_OP_ALL for maximum compatibility with broken servers
        // See http://www.openssl.org/docs/ssl/SSL_CTX_set_options.html
        if (!options) options = {};
        // TODO: bug in Node means we can't do this until it's fixed
        // options.secureOptions = constants.SSL_OP_ALL;

        // See comments around similar code in createServer above for what's
        // going on here.
        options.secureProtocol = options.secureProtocol || 'SSLv23_method';
        options.secureOptions = options.secureOptions |
                    constants.SSL_OP_NO_SSLv2 | constants.SSL_OP_NO_SSLv3;

        var requestCert = true;
        var rejectUnauthorized = false;
        if (options) {
            if (options.requestCert !== undefined) {
                requestCert = options.requestCert;
            }
            if (options.rejectUnauthorized !== undefined) {
                rejectUnauthorized = options.rejectUnauthorized;
            }
        }
        var sslcontext = (tls.createSecureContext || crypto.createCredentials)(options);

        // tls.createSecurePair([credentials], [isServer]);
        var pair = tls.createSecurePair(sslcontext, false, requestCert, rejectUnauthorized);

        socket.pair = pair;

        var cleartext = pipe(pair, cryptoSocket);

        pair.on('error', function(exception) {
            socket.emit('error', exception);
        });

        pair.on('secure', function() {
            var verifyError = (pair.ssl || pair._ssl).verifyError();

            log.logdebug('client TLS secured.');
            if (verifyError) {
                cleartext.authorized = false;
                cleartext.authorizationError = verifyError;
            }
            else {
                cleartext.authorized = true;
            }
            var cert = pair.cleartext.getPeerCertificate();
            if (pair.cleartext.getCipher) {
                var cipher = pair.cleartext.getCipher();
            }

            if (cb2) cb2(cleartext.authorized, verifyError, cert, cipher);

            socket.emit('secure');
        });

        cleartext._controlReleased = true;
        socket.cleartext = cleartext;

        if (socket._timeout) {
            cleartext.setTimeout(socket._timeout);
        }

        cleartext.setKeepAlive(socket._keepalive);

        socket.attach(socket.cleartext);

        log.logdebug('client TLS upgrade in progress, awaiting secured.');
    };

    return (socket);
}

exports.load_tls_ini = function (cb) {
    var cfg = config.get('tls.ini', {
        booleans: [
            '+main.requestCert',
            '-main.rejectUnauthorized',
            '-redis.disable_for_failed_hosts',
        ]
    }, cb);

    if (!cfg.no_tls_hosts) {
        cfg.no_tls_hosts = {};
    }

    return cfg;
}

exports.is_no_tls_host = function (cfg, ip) {
    if (!net.isIP(ip)) return (ip in cfg.no_tls_hosts); // domain

    for (var host in cfg.no_tls_hosts) {
        if (host === ip) return true; // exact match

        var cidr = host.split('/');

        var c_net  = cidr[0];

        if (!net.isIP(c_net)) continue;  // bad config entry
        if (net.isIPv4(ip) && net.isIPv6(c_net)) continue;
        if (net.isIPv6(ip) && net.isIPv4(c_net)) continue;

        var c_mask = parseInt(cidr[1], 10) || (net.isIPv6(c_net) ? 128 : 32);

        if (ipaddr.parse(ip).match(ipaddr.parse(c_net), c_mask)) {
            return true;
        }
    }

    return false;
}

exports.connect = connect;
exports.createConnection = connect;
exports.Server = createServer;
exports.createServer = createServer;
