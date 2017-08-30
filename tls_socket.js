'use strict';
/*--------------------------------------------------------------------------*/
/* Obtained and modified from http://js.5sh.net/starttls.js on 8/18/2011.   */
/*--------------------------------------------------------------------------*/

const async     = require('async');
const tls       = require('tls');
const util      = require('util');
const net       = require('net');
const openssl   = require('openssl-wrapper').exec;
const path      = require('path');
const spawn     = require('child_process').spawn;
const stream    = require('stream');

exports.config  = require('haraka-config');  // exported for tests

const log       = require('./logger');

var certsByHost = {};
var ctxByHost = {};
var ocsp;
var ocspCache;

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

exports.parse_x509_names = function (string) {
    // receives the text value of a x509 certificate and returns an array of
    // of names extracted from the Subject CN and the v3 Subject Alternate Names
    let names_found = [];

    // log.loginfo(string);

    let match = /Subject:.*?CN=([^\/\s]+)/.exec(string);
    if (match) {
        // log.loginfo(match[0]);
        if (match[1]) {
            // log.loginfo(match[1]);
            names_found.push(match[1]);
        }
    }

    match = /X509v3 Subject Alternative Name:[^]*X509/.exec(string);
    if (match) {
        let dns_name;
        let re = /DNS:([^,]+)[,\n]/g;
        while ((dns_name = re.exec(match[0])) !== null) {
            // log.loginfo(dns_name);
            if (names_found.indexOf(dns_name[1]) !== -1) continue; // ignore dupes
            names_found.push(dns_name[1]);
        }
    }

    return names_found;
}

exports.parse_x509_expire = function (file, string) {

    let dateMatch = /Not After : (.*)/.exec(string);
    if (!dateMatch) return;

    // log.loginfo(dateMatch[1]);
    return new Date(dateMatch[1]);
}

exports.parse_x509 = function (string) {
    var res = {};

    let match = /^([^\-]*)?([\-]+BEGIN (?:\w+\s)?PRIVATE KEY[\-]+[^\-]+[\-]+END (?:\w+\s)?PRIVATE KEY[\-]+\n)([^]*)$/.exec(string);
    if (!match) return res;

    if (match[1] && match[1].length) {
        log.logerror('leading garbage');
        log.logerror(match[1]);
    }
    if (!match[2] || !match[2].length) return res;
    res.key = Buffer.from(match[2]);

    if (!match[3] || !match[3].length) return res;
    res.cert = Buffer.from(match[3]);

    return res;
}

exports.load_tls_ini = function () {
    let tlss = this;

    log.loginfo('loading tls.ini');

    let cfg = exports.config.get('tls.ini', {
        booleans: [
            '-redis.disable_for_failed_hosts',

            // wildcards match in any section and are not initialized
            '*.requestCert',
            '*.rejectUnauthorized',
            '*.honorCipherOrder' ,
            '*.enableOCSPStapling',
            '*.requestOCSP',

            // explicitely declared booleans are initialized
            '+main.requestCert',
            '-main.rejectUnauthorized',
            '+main.honorCipherOrder',
            '-main.requestOCSP',
        ]
    }, function () {
        tlss.load_tls_ini();
    });

    if (!cfg.no_tls_hosts) cfg.no_tls_hosts = {};

    if (cfg.main.enableOCSPStapling !== undefined) {
        log.logerror('deprecated setting enableOCSPStapling in tls.ini');
        cfg.main.requestOCSP = cfg.main.enableOCSPStapling;
    }

    if (ocsp === undefined && cfg.main.requestOCSP) {
        try {
            ocsp = require('ocsp');
            log.logdebug('ocsp loaded');
            ocspCache = new ocsp.Cache();
        }
        catch (ignore) {
            log.lognotice("OCSP Stapling not available.");
        }
    }

    tlss.cfg = cfg;

    tlss.applySocketOpts('*');
    tlss.load_default_opts();

    return cfg;
}

exports.saveOpt = function (name, opt, val) {
    if (certsByHost[name] === undefined) certsByHost[name] = {};
    certsByHost[name][opt] = val;
}

exports.applySocketOpts = function (name) {
    let tlss = this;

    if (!certsByHost[name]) certsByHost[name] = {};

    // https://nodejs.org/api/tls.html#tls_new_tls_tlssocket_socket_options
    let TLSSocketOptions = [
        // 'server'        // manually added
        'isServer', 'requestCert',  'rejectUnauthorized',
        'NPNProtocols', 'ALPNProtocols', 'session',
        'requestOCSP',  'secureContext', 'SNICallback'
    ];

    // https://nodejs.org/api/tls.html#tls_tls_createsecurecontext_options
    let createSecureContextOptions = [
        'key', 'cert', 'dhparam',
        'pfx', 'passphrase', 'ca', 'crl', 'ciphers', 'honorCipherOrder',
        'ecdhCurve', 'secureProtocol', 'secureOptions', 'sessionIdContext'
    ];

    let allOpts = TLSSocketOptions.concat(createSecureContextOptions);

    allOpts.forEach(opt => {

        if (tlss.cfg[name] && tlss.cfg[name][opt] !== undefined) {
            // if the setting exists in tls.ini [name]
            tlss.saveOpt(name, opt, tlss.cfg[name][opt]);
        }
        else if (tlss.cfg.main[opt] !== undefined) {
            // if the setting exists in tls.ini [main]
            // then save it to the certsByHost options
            tlss.saveOpt(name, opt, tlss.cfg.main[opt]);
        }

        // defaults
        switch (opt) {
            case 'sessionIdContext':
                tlss.saveOpt(name, opt, 'haraka');
                break;
            case 'isServer':
                tlss.saveOpt(name, opt, true);
                break;
            case 'key':
                tlss.saveOpt(name, opt, 'tls_key.pem');
                break;
            case 'cert':
                tlss.saveOpt(name, opt, 'tls_cert.pem');
                break;
            case 'dhparam':
                tlss.saveOpt(name, opt, 'dhparams.pem');
                break;
            case 'SNICallback':
                tlss.saveOpt(name, opt, SNICallback);
                break;
        }
    })
}

exports.load_default_opts = function () {
    let tlss = this;

    let cfg = certsByHost['*'];

    if (cfg.dhparam && typeof cfg.dhparam === 'string') {
        tlss.saveOpt('*', 'dhparam', tlss.config.get(cfg.dhparam, 'binary'));
    }

    // make non-array key/cert option into Arrays with one entry
    if (!(Array.isArray(cfg.key ))) cfg.key  = [cfg.key];
    if (!(Array.isArray(cfg.cert))) cfg.cert = [cfg.cert];

    if (cfg.key.length != cfg.cert.length) {
        log.logerror("number of keys (" + cfg.key.length +
            ") not equal to certs (" + cfg.cert.length + ").");
    }

    // if key file has already been loaded, it'll be a Buffer.
    if (typeof cfg.key[0] === 'string') {
        // turn key/cert file names into actual key/cert binary data
        let asArray = cfg.key.map(keyFileName => {
            if (!keyFileName) return;
            let key = tlss.config.get(keyFileName, 'binary');
            if (!key) {
                log.logerror("tls key " + keyFileName + " could not be loaded.");
                log.logerror(tlss.config);
            }
            return key;
        })
        tlss.saveOpt('*', 'key', asArray);
    }

    if (typeof cfg.cert[0] === 'string') {
        let asArray = cfg.cert.map(certFileName => {
            if (!certFileName) return;
            var cert = tlss.config.get(certFileName, 'binary');
            if (!cert) {
                log.logerror("tls cert " + certFileName + " could not be loaded.");
            }
            return cert;
        })
        tlss.saveOpt('*', 'cert', asArray);
    }

    if (cfg.cert[0] && cfg.key[0]) {
        tlss.tls_valid = true;

        // now that all opts are applied, generate TLS context
        tlss.ensureDhparams(() => {
            ctxByHost['*'] = tls.createSecureContext(cfg);
        })
    }
}

function SNICallback (servername, sniDone) {
    log.logdebug('SNI servername: ' + servername);

    if (ctxByHost[servername] === undefined) servername = '*';

    sniDone(null, ctxByHost[servername]);
}

exports.get_certs_dir = function (tlsDir, done) {
    var tlss = this;

    tlss.config.getDir(tlsDir, {}, (iterErr, files) => {
        if (iterErr) return done(iterErr);

        async.map(files, (file, iter_done) => {

            let parsed = exports.parse_x509(file.data.toString());
            if (!parsed.key) {
                return iter_done('no PRIVATE key in ' + file.path);
            }
            if (!parsed.cert) {
                log.logerror('no CERT in ' + file.path);
                return iter_done('no CERT in ' + file.path);
            }

            let x509args = { noout: true, text: true };

            openssl('x509', parsed.cert, x509args, function (e, as_str) {
                if (e) {
                    log.logerror(`BAD TLS in ${file.path}`);
                    log.logerror(e);
                }

                let expire = tlss.parse_x509_expire(file, as_str);
                if (expire && expire < new Date()) {
                    log.logerror(file.path + ' expired on ' + expire);
                }

                iter_done(null, {
                    err: e,
                    file: path.basename(file.path),
                    key: parsed.key,
                    cert: parsed.cert,
                    names: tlss.parse_x509_names(as_str),
                    expires: expire,
                })
            })
        },
        (finalErr, certs) => {

            if (finalErr) log.logerror(finalErr);

            if (!certs || !certs.length) {
                log.loginfo('0 TLS certs in config/tls');
                return done(null, certs);
            }

            certs.forEach(cert => {
                if (cert.err) {
                    log.logerror(`${cert.file} had error: ${cert.err.message}`);
                }

                log.logdebug(cert);
                cert.names.forEach(name => {
                    tlss.applySocketOpts(name);

                    tlss.saveOpt(name, 'cert', cert.cert);
                    tlss.saveOpt(name, 'key', cert.key);
                    if (certsByHost['*'] !== undefined && certsByHost['*'].dhparam) {
                        // copy in dhparam from default '*' TLS config
                        tlss.saveOpt(name, 'dhparam', certsByHost['*'].dhparam);
                    }

                    // now that all opts are applied, generate TLS context
                    ctxByHost[name] = tls.createSecureContext(certsByHost[name]);
                })
            })

            // log.loginfo(exports.certsByHost);
            done(null, exports.certsByHost);
        })
    })
}

exports.getSocketOpts = function (name, done) {
    let tlss = this;

    function getTlsOpts () {
        if (certsByHost[name]) {
            // log.logdebug(certsByHost[name]);
            return done(certsByHost[name]);
        }
        // log.logdebug(certsByHost['*']);
        done(certsByHost['*']);
    }

    // startup time, load the config/tls dir
    if (!certsByHost['*']) {
        tlss.load_tls_ini();
        tlss.get_certs_dir('tls', getTlsOpts);
        return;
    }

    getTlsOpts();
}

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

exports.ensureDhparams = function (done) {
    let tlss = this;

    // empty/missing dhparams file
    if (certsByHost['*'].dhparam) {
        return done(null, certsByHost['*'].dhparam);
    }

    let filePath = tlss.cfg.main.dhparam;
    if (!filePath) filePath = path.resolve(exports.config.root_path, 'dhparams.pem');
    log.loginfo(`Generating a 2048 bit dhparams file at ${filePath}`);

    let o = spawn('openssl', ['dhparam', '-out', `${filePath}`, '2048']);
    o.stdout.on('data', data => {
        // normally empty output
        log.logdebug(data);
    })

    o.stderr.on('data', data => {
        // this is the status gibberish `openssl dhparam` spews as it works
    })

    o.on('close', code => {
        if (code !== 0) {
            return done('Error code: ' + code);
        }

        log.loginfo(`Saved to ${filePath}`);
        let content = tlss.config.get(filePath, 'binary');

        tlss.saveOpt('*', 'dhparam', content);
        done(null, certsByHost['*'].dhparam);
    });
}

exports.addOCSP = function (server) {
    if (!ocsp) {
        log.logdebug('addOCSP: not available');
        return;
    }

    if (server.listenerCount('OCSPRequest') > 0) {
        log.logdebug('OCSPRequest already listening');
        return;
    }

    log.logdebug('adding OCSPRequest listener');
    server.on('OCSPRequest', function (cert, issuer, ocr_cb) {
        log.logdebug('OCSPRequest: ' + cert);
        ocsp.getOCSPURI(cert, function (err, uri) {
            log.logdebug('OCSP Request, URI: ' + uri + ', err=' +err);
            if (err) return ocr_cb(err);
            if (uri === null) return ocr_cb();  // not working OCSP server

            let req = ocsp.request.generate(cert, issuer);

            // look for a cached value first
            ocspCache.probe(req.id, function (err2, cached) {
                if (err2) return ocr_cb(err2);

                if (cached) {
                    log.logdebug('OCSP cache: ' + util.inspect(cached));
                    return ocr_cb(err2, cached.response);
                }

                let options = {
                    url: uri,
                    ocsp: req.data
                };

                log.logdebug('OCSP req:' + util.inspect(req));
                ocspCache.request(req.id, options, ocr_cb);
            })
        })
    })
}

exports.shutdown = function () {
    if (ocsp) cleanOcspCache();
}

function cleanOcspCache () {
    log.logdebug('Cleaning ocspCache. How many keys? ' + Object.keys(ocspCache.cache).length);
    Object.keys(ocspCache.cache).forEach(function (key) {
        clearTimeout(ocspCache.cache[key].timer);
    });
}

exports.certsByHost = certsByHost;
exports.ocsp = ocsp;

function createServer (cb) {
    let server = net.createServer(function (cryptoSocket) {

        var socket = new pluggableStream(cryptoSocket);

        exports.addOCSP(server);

        socket.upgrade = function (cb2) {
            log.logdebug('Upgrading to TLS');

            socket.clean();

            cryptoSocket.removeAllListeners('data');

            let options = Object.assign({}, certsByHost['*']);
            options.server = server;  // TLSSocket needs server for SNI to work

            var cleartext = new tls.TLSSocket(cryptoSocket, options);

            pipe(cleartext, cryptoSocket);

            cleartext
                .on('error', (exception) => {
                    socket.emit('error', exception);
                })
                .on('secure', function () {
                    log.logdebug('TLS secured.');
                    socket.emit('secure');
                    if (cb2) cb2(
                        cleartext.authorized,
                        cleartext.authorizationError,
                        cleartext.getPeerCertificate(),
                        cleartext.getCipher()
                    );
                })

            socket.cleartext = cleartext;

            if (socket._timeout) {
                cleartext.setTimeout(socket._timeout);
            }

            cleartext.setKeepAlive(socket._keepalive);

            socket.attach(socket.cleartext);
        };

        cb(socket);
    });

    return server;
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

        options = Object.assign(options, certsByHost['*']);
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
