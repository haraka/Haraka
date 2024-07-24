'use strict';

const cluster   = require('node:cluster');
const net       = require('node:net');
const path      = require('node:path');
const { spawn } = require('node:child_process');
const stream    = require('node:stream');
const tls       = require('node:tls');
const util      = require('node:util');

// npm packages
exports.config  = require('haraka-config');  // exported for tests
const Notes = require('haraka-notes')

const log       = require('./logger');

const certsByHost = new Notes();
const ctxByHost = {};
let ocsp;
let ocspCache;

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

    pause () {
        if (this.targetsocket.pause) {
            this.targetsocket.pause();
            this.readable = false;
        }
    }

    resume () {
        if (this.targetsocket.resume) {
            this.readable = true;
            this.targetsocket.resume();
        }
    }

    attach (socket) {
        this.targetsocket = socket;
        this.targetsocket.on('data', data => {
            this.emit('data', data);
        });
        this.targetsocket.on('connect', (a, b) => {
            this.emit('connect', a, b);
        });
        this.targetsocket.on('secureConnect', (a, b) => {
            this.emit('secureConnect', a, b);
            this.emit('secure', a, b);
        });
        this.targetsocket.on('secure', (a, b) => {
            this.emit('secure', a, b);
        });
        this.targetsocket.on('end', () => {
            this.writable = this.targetsocket.writable;
            this.emit('end');
        });
        this.targetsocket.on('close', had_error => {
            this.writable = this.targetsocket.writable;
            this.emit('close', had_error);
        });
        this.targetsocket.on('drain', () => {
            this.emit('drain');
        });
        this.targetsocket.once('error', exception => {
            this.writable = this.targetsocket.writable;
            exception.source = 'tls';
            this.emit('error', exception);
        });
        this.targetsocket.on('timeout', () => {
            this.emit('timeout');
        });
        if (this.targetsocket.remotePort) {
            this.remotePort = this.targetsocket.remotePort;
        }
        if (this.targetsocket.remoteAddress) {
            this.remoteAddress = this.targetsocket.remoteAddress;
        }
        if (this.targetsocket.localPort) {
            this.localPort = this.targetsocket.localPort;
        }
        if (this.targetsocket.localAddress) {
            this.localAddress = this.targetsocket.localAddress;
        }
    }

    clean (data) {
        if (this.targetsocket?.removeAllListeners) {
            for (const name of ['data', 'secure', 'secureConnect', 'end', 'close', 'error', 'drain']) {
                this.targetsocket.removeAllListeners(name);
            }
        }
        this.targetsocket = {};
        this.targetsocket.write = () => {};
    }

    write (data, encoding, callback) {
        if (this.targetsocket.write) {
            return this.targetsocket.write(data, encoding, callback);
        }
        return false;
    }

    end (data, encoding) {
        if (this.targetsocket.end) {
            return this.targetsocket.end(data, encoding);
        }
    }

    destroySoon () {
        if (this.targetsocket.destroySoon) {
            return this.targetsocket.destroySoon();
        }
    }

    destroy () {
        if (this.targetsocket.destroy) {
            return this.targetsocket.destroy();
        }
    }

    setKeepAlive (bool) {
        this._keepalive = bool;
        return this.targetsocket.setKeepAlive(bool);
    }

    setNoDelay (/* true||false */) {
    }

    unref () {
        return this.targetsocket.unref();
    }

    setTimeout (timeout) {
        this._timeout = timeout;
        return this.targetsocket.setTimeout(timeout);
    }

    isEncrypted () {
        return this.targetsocket.encrypted;
    }

    isSecure () {
        return this.targetsocket.encrypted && this.targetsocket.authorized;
    }
}

exports.parse_x509 = async (string) => {
    const res = {};
    if (!string) return res

    const keyRe  = new RegExp('([-]+BEGIN (?:\\w+ )?PRIVATE KEY[-]+[^-]*[-]+END (?:\\w+ )?PRIVATE KEY[-]+)', 'gm')
    res.keys = string.match(keyRe)

    const certRe = new RegExp('([-]+BEGIN CERTIFICATE[-]+[^-]*[-]+END CERTIFICATE[-]+)', 'gm')
    res.chain = string.match(certRe)

    if (res.chain?.length) {
        const opensslArgs = [res.chain[0], 'x509', '-noout']
        // shush openssl, https://github.com/openssl/openssl/issues/22893
        // if (['darwin','linux','freebsd'].includes(process.platform))
        //     opensslArgs.push('-in', '/dev/stdin')

        // it's cleaner to call openssl with each of -enddate, -subject, etc, but it costs
        // 40-50ms per spawn with node v21 on a M1 MBP
        const raw = await openssl(...opensslArgs, '-enddate', '-subject', '-ext', 'subjectAltName')
        if (!raw) return res

        res.expire = new Date(raw.match(/notAfter=(.* [A-Z]{3})/)[1])

        const match = /CN\s*=\s*([^/\s,]+)/.exec(raw);
        if (match && match[1]) res.names = [ match[1] ]

        for (let name of Array.from(raw.matchAll(/DNS:([^\s,]+)/gm), (m) => m[0])) {
            name = name.replace('DNS:', '')
            if (!res.names.includes(name)) res.names.push(name)
        }
    }

    return res;
}

exports.load_tls_ini = (opts) => {

    log.info(`loading tls.ini`); // from ${this.config.root_path}`);

    const cfg = exports.config.get('tls.ini', {
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
            '-main.mutual_tls',
        ]
    }, () => {
        this.load_tls_ini();
    });

    if (cfg.no_tls_hosts === undefined) cfg.no_tls_hosts = {};
    if (cfg.mutual_auth_hosts === undefined) cfg.mutual_auth_hosts = {};
    if (cfg.mutual_auth_hosts_exclude === undefined) cfg.mutual_auth_hosts_exclude = {};

    if (cfg.main.enableOCSPStapling !== undefined) {
        log.error('deprecated setting enableOCSPStapling in tls.ini');
        cfg.main.requestOCSP = cfg.main.enableOCSPStapling;
    }

    if (ocsp === undefined && cfg.main.requestOCSP) {
        try {
            ocsp = require('ocsp');
            log.debug('ocsp loaded');
            ocspCache = new ocsp.Cache();
        }
        catch (ignore) {
            log.notice("OCSP Stapling not available.");
        }
    }

    if (cfg.main.requireAuthorized === undefined) {
        cfg.main.requireAuthorized = [];
    }
    else if (!Array.isArray(cfg.main.requireAuthorized)) {
        cfg.main.requireAuthorized = [cfg.main.requireAuthorized];
    }

    if (!Array.isArray(cfg.main.no_starttls_ports)) cfg.main.no_starttls_ports = [];

    this.cfg = cfg;

    if (!opts || opts.role === 'server') {
        this.applySocketOpts('*');
        this.load_default_opts();
    }

    return cfg;
}

exports.applySocketOpts = name => {

    // https://nodejs.org/api/tls.html#tls_new_tls_tlssocket_socket_options
    const TLSSocketOptions = [
        // 'server'        // manually added
        'isServer', 'requestCert',  'rejectUnauthorized',
        'NPNProtocols', 'ALPNProtocols', 'session',
        'requestOCSP',  'secureContext', 'SNICallback'
    ];

    // https://nodejs.org/api/tls.html#tls_tls_createsecurecontext_options
    const createSecureContextOptions = [
        'key', 'cert', 'dhparam',
        'pfx', 'passphrase', 'ca', 'crl', 'ciphers', 'minVersion', 'honorCipherOrder',
        'ecdhCurve', 'secureProtocol', 'secureOptions', 'sessionIdContext'
    ];

    for (const opt of [ ...TLSSocketOptions, ...createSecureContextOptions ]) {

        if (this.cfg[name] && this.cfg[name][opt] !== undefined) {
            // if the setting exists in tls.ini [name]
            certsByHost.set([name, opt], this.cfg[name][opt])
        }
        else if (this.cfg.main[opt] !== undefined) {
            // save settings in tls.ini [main] to each CN
            certsByHost.set([name, opt], this.cfg.main[opt])
        }
        else {
            // defaults
            switch (opt) {
                case 'sessionIdContext':
                    certsByHost.set([name, opt], 'haraka')
                    break;
                case 'isServer':
                    certsByHost.set([name, opt], true)
                    break;
                case 'key':
                    certsByHost.set([name, opt], 'tls_key.pem')
                    break;
                case 'cert':
                    certsByHost.set([name, opt], 'tls_cert.pem')
                    break;
                case 'dhparam':
                    certsByHost.set([name, opt], 'dhparams.pem')
                    break;
                case 'SNICallback':
                    certsByHost.set([name, opt], exports.SNICallback)
                    break;
            }
        }
    }
}

exports.load_default_opts = () => {

    const cfg = certsByHost['*'];

    if (cfg.dhparam && typeof cfg.dhparam === 'string') {
        log.debug(`loading dhparams from ${cfg.dhparam}`);
        certsByHost.set('*.dhparam', this.config.get(cfg.dhparam, 'binary'))
    }

    if (cfg.ca && typeof cfg.ca === 'string') {
        log.info(`loading CA certs from ${cfg.ca}`);
        certsByHost.set('*.ca', this.config.get(cfg.ca, 'binary'))
    }

    // make non-array key/cert option into Arrays with one entry
    if (!(Array.isArray(cfg.key ))) cfg.key  = [cfg.key];
    if (!(Array.isArray(cfg.cert))) cfg.cert = [cfg.cert];

    if (cfg.key.length != cfg.cert.length) {
        log.error(`number of keys (${cfg.key.length}) not equal to certs (${cfg.cert.length}).`);
    }

    // if key file has already been loaded, it'll be a Buffer.
    if (typeof cfg.key[0] === 'string') {
        // turn key/cert file names into actual key/cert binary data
        const asArray = cfg.key.map(keyFileName => {
            if (!keyFileName) return;
            const key = this.config.get(keyFileName, 'binary');
            if (!key) {
                log.error(`tls key ${path.join(this.config.root_path, keyFileName)} could not be loaded.`);
            }
            return key;
        })
        certsByHost.set('*.key', asArray)
    }

    if (typeof cfg.cert[0] === 'string') {
        const asArray = cfg.cert.map(certFileName => {
            if (!certFileName) return;
            const cert = this.config.get(certFileName, 'binary');
            if (!cert) {
                log.error(`tls cert ${path.join(this.config.root_path, certFileName)} could not be loaded.`);
            }
            return cert;
        })
        certsByHost.set('*.cert', asArray)
    }

    if (cfg.cert[0] && cfg.key[0]) {
        this.tls_valid = true;

        // now that all opts are applied, generate TLS context
        this.ensureDhparams(() => {
            ctxByHost['*'] = tls.createSecureContext(cfg);
        })
    }
}

exports.SNICallback = function (servername, sniDone) {
    log.debug(`SNI servername: ${servername}`);

    sniDone(null, ctxByHost[servername] || ctxByHost['*']);
}

exports.get_certs_dir = async (tlsDir) => {
    const r = {}
    const watcher = async () => {
        exports.get_certs_dir(tlsDir)
    }
    const dirOpts = { type: 'binary', watchCb: watcher }

    const files = await this.config.getDir(tlsDir, dirOpts)
    for (const file of files) {
        try {
            r[file.path] = await exports.parse_x509(file.data.toString());
        }
        catch (err) {
            log.debug(err.message)
        }
    }

    log.debug(`found ${Object.keys(r).length} files in config/tls`);
    if (Object.keys(r).length === 0) return

    const s = {} // certs by name (CN)

    for (const fp in r) {

        if (r[fp].expire && r[fp].expire < new Date()) {
            log.error(`${fp} expired on ${r[fp].expire}`)
        }

        // a file with a key and no cert, get name from file
        if (!r[fp].names) r[fp].names = [ path.parse(fp).name ]

        for (let name of r[fp].names) {
            if (name[0] === '_') name = name.replace('_', '*') // windows
            if (s[name] === undefined) s[name] = {}
            if (!s[name].key && r[fp].keys) s[name].key = r[fp].keys[0]
            if (!s[name].cert && r[fp].chain) {
                s[name].cert = r[fp].chain[0]
                s[name].file = fp
            }
        }
    }

    for (const cn in s) {
        if (!s[cn].cert || !s[cn].key) {
            delete s[cn]
            continue
        }

        this.applySocketOpts(cn) // from tls.ini
        certsByHost.set([cn, 'cert'], Buffer.from(s[cn].cert))
        certsByHost.set([cn, 'key'], Buffer.from(s[cn].key))
        certsByHost.set([cn, 'dhparam'], certsByHost['*'].dhparam, true);

        // all opts are applied, generate TLS context
        try {
            ctxByHost[cn] = tls.createSecureContext(certsByHost.get([cn]));
        }
        catch (err) {
            log.error(`CN '${cn}' loading got: ${err.message}`)
            delete ctxByHost[cn]
            delete certsByHost[cn]
        }
    }

    log.info(`found ${Object.keys(s).length} TLS certs in config/tls`);

    return certsByHost // used only by tests
}

function openssl (crt, ...params) {
    return new Promise((resolve) => {
        let crtTxt = ''

        const o = spawn('openssl', [...params], { timeout: 1000 });
        o.stdout.on('data', data => {
            crtTxt += data
        })

        o.stderr.on('data', data => {
            log.debug(`err: ${data.toString().trim()}`)
        })

        o.on('close', code => {
            if (code !== 0) {
                if (code) console.error(code)
            }
            resolve(crtTxt)
        })

        o.stdin.write(crt)
        o.stdin.write('\n')
    })
}

exports.getSocketOpts = async (name) => {

    // startup time, load the config/tls dir
    if (!certsByHost['*']) this.load_tls_ini();

    try {
        await this.get_certs_dir('tls')
    }
    catch (err) {
        if (err.code !== 'ENOENT') {
            console.error(err.messsage)
            log.error(err)
        }
    }

    return certsByHost[name] || certsByHost['*']
}

function pipe (cleartext, socket) {
    cleartext.socket = socket;

    function onError (e) {
    }

    function onClose () {
        socket.removeListener('error', onError);
        socket.removeListener('close', onClose);
    }

    socket.on('error', onError);
    socket.on('close', onClose);
}

exports.ensureDhparams = done => {

    // empty/missing dhparams file
    if (certsByHost['*'].dhparam) {
        return done(null, certsByHost['*'].dhparam);
    }

    if (cluster.isWorker) return; // only once, on the master process

    const filePath = this.cfg.main.dhparam || 'dhparams.pem';
    const fpResolved = path.resolve(exports.config.root_path, filePath);

    log.info(`Generating a 2048 bit dhparams file at ${fpResolved}`);

    const o = spawn('openssl', ['dhparam', '-out', `${fpResolved}`, '2048']);
    o.stdout.on('data', data => {
        // normally empty output
        log.debug(data);
    })

    o.stderr.on('data', data => {
        // this is the status gibberish `openssl dhparam` spews as it works
    })

    o.on('close', code => {
        if (code !== 0) {
            return done(`Error code: ${code}`);
        }

        log.info(`Saved to ${fpResolved}`);
        const content = this.config.get(filePath, 'binary');

        certsByHost.set('*.dhparam', content)
        done(null, certsByHost['*'].dhparam);
    });
}

exports.addOCSP = server => {
    if (!ocsp) {
        log.debug(`addOCSP: 'ocsp' not available`);
        return;
    }

    if (server.listenerCount('OCSPRequest') > 0) {
        log.debug('OCSPRequest already listening');
        return;
    }

    log.debug('adding OCSPRequest listener');
    server.on('OCSPRequest', (cert, issuer, ocr_cb) => {
        log.debug(`OCSPRequest: ${cert}`);
        ocsp.getOCSPURI(cert, async (err, uri) => {
            log.debug(`OCSP Request, URI: ${uri}, err=${err}`);
            if (err) return ocr_cb(err);
            if (uri === null) return ocr_cb();  // not working OCSP server

            const req = ocsp.request.generate(cert, issuer);
            const cached = await ocspCache.probe(req.id)

            if (cached) {
                log.debug(`OCSP cache: ${util.inspect(cached)}`);
                return ocr_cb(null, cached.response);
            }

            const options = {
                url: uri,
                ocsp: req.data
            };

            log.debug(`OCSP req:${util.inspect(req)}`);
            ocspCache.request(req.id, options, ocr_cb);
        })
    })
}

exports.shutdown = () => {
    if (ocsp) cleanOcspCache();
}

function cleanOcspCache () {
    log.debug(`Cleaning ocspCache. How many keys? ${Object.keys(ocspCache.cache).length}`);
    Object.keys(ocspCache.cache).forEach((key) => {
        clearTimeout(ocspCache.cache[key].timer);
    });
}

exports.certsByHost = certsByHost;
exports.ocsp = ocsp;

exports.get_rejectUnauthorized = (rejectUnauthorized, port, port_list) => {
    // console.log(`rejectUnauthorized: ${rejectUnauthorized}, port ${port}, list: ${port_list}`)

    if (rejectUnauthorized) return true;

    return !!(port_list.includes(port));
}

function createServer (cb) {
    const server = net.createServer(cryptoSocket => {

        const socket = new pluggableStream(cryptoSocket);

        exports.addOCSP(server);

        socket.upgrade = cb2 => {
            log.debug('Upgrading to TLS');

            socket.clean();

            cryptoSocket.removeAllListeners('data');

            const options = Object.assign({}, certsByHost['*']);
            options.server = server;  // TLSSocket needs server for SNI to work

            options.rejectUnauthorized = exports.get_rejectUnauthorized(options.rejectUnauthorized, cryptoSocket.localPort, exports.cfg.main.requireAuthorized);

            const cleartext = new tls.TLSSocket(cryptoSocket, options);

            pipe(cleartext, cryptoSocket);

            cleartext
                .on('error', exception => {
                    exception.source = 'tls';
                    socket.emit('error', exception);
                })
                .on('secure', () => {
                    log.debug('TLS secured.');
                    socket.emit('secure');
                    const cipher = cleartext.getCipher();
                    cipher.version = cleartext.getProtocol();
                    if (cb2) cb2(
                        cleartext.authorized,
                        cleartext.authorizationError,
                        cleartext.getPeerCertificate(),
                        cipher
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

function getCertFor (host) {
    if (host && certsByHost[host]) return certsByHost[host];
    return certsByHost['*'];  // the default TLS cert
}

function connect (conn_options = {}) {
    // called by outbound/client_pool, smtp_client, plugins/spamassassin,avg,clamd

    const cryptoSocket = net.connect(conn_options);
    const socket = new pluggableStream(cryptoSocket);

    socket.upgrade = (options, cb2) => {
        socket.clean();
        cryptoSocket.removeAllListeners('data');

        if (exports.tls_valid) {
            const host = conn_options.host
            if (exports.cfg === undefined) exports.load_tls_ini();
            if (exports.cfg.mutual_auth_hosts[host]) {
                options = Object.assign(options, getCertFor(exports.cfg.mutual_auth_hosts[host]));
            }
            else if (exports.cfg.mutual_auth_hosts_exclude[host]) {
                // send no client cert
            }
            else if (exports.cfg.main.mutual_tls) {
                options = Object.assign(options, getCertFor(host));
            }
        }
        options.socket = cryptoSocket;

        const cleartext = new tls.connect(options);

        pipe(cleartext, cryptoSocket);

        cleartext.on('error', err => {
            if (err.reason) log.error(`client TLS error: ${err}`);
        })

        cleartext.once('secureConnect', () => {
            log.debug('client TLS secured.');
            const cipher = cleartext.getCipher();
            cipher.version = cleartext.getProtocol();
            if (cb2) cb2(
                cleartext.authorized,
                cleartext.authorizationError,
                cleartext.getPeerCertificate(),
                cipher
            );
        });

        socket.cleartext = cleartext;

        if (socket._timeout) {
            cleartext.setTimeout(socket._timeout);
        }

        cleartext.setKeepAlive(socket._keepalive);

        socket.attach(socket.cleartext);

        log.debug('client TLS upgrade in progress, awaiting secured.');
    }

    return socket;
}

exports.connect = connect;
exports.createConnection = connect;
exports.Server = createServer;
exports.createServer = createServer;
