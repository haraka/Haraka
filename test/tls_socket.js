'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')
const net = require('node:net')
const tls = require('node:tls')
const fs = require('node:fs')
const { EventEmitter, once } = require('node:events')
const { setTimeout: sleep } = require('node:timers/promises')

const tls_socket = require('../tls_socket')

const TEST_CERT = fs.readFileSync(path.join(__dirname, 'config/tls_cert.pem'))
const TEST_KEY = fs.readFileSync(path.join(__dirname, 'config/tls_key.pem'))

const listen = async (server) => {
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
    return server.address().port
}

test('tls_socket', async (t) => {
    await t.test('parse_x509', async (t) => {
        await t.test('handles empty string', async () => {
            const res = await tls_socket.parse_x509('')
            assert.deepEqual(res, {})
        })

        await t.test('handles null/undefined', async () => {
            const res = await tls_socket.parse_x509(null)
            assert.deepEqual(res, {})
        })

        // This would exercise the uninitialized res.names bug if we had a cert string
        // but since it spawns openssl, we'd need to mock spawn or provide a real cert.
    })

    await t.test('get_rejectUnauthorized', async (t) => {
        await t.test('returns true if rejectUnauthorized is true', () => {
            assert.strictEqual(tls_socket.get_rejectUnauthorized(true, 25, [25]), true)
        })

        await t.test('returns true if port is in port_list', () => {
            assert.strictEqual(tls_socket.get_rejectUnauthorized(false, 465, [465]), true)
        })

        await t.test('returns false if port is not in port_list', () => {
            assert.strictEqual(tls_socket.get_rejectUnauthorized(false, 25, [465]), false)
        })
    })

    await t.test('SNICallback', async (t) => {
        await t.test('calls sniDone with default context if servername unknown', (t, done) => {
            // This test requires some setup of ctxByHost which is private to the module
            // but we can test if it's a function
            assert.strictEqual(typeof tls_socket.SNICallback, 'function')
            done()
        })
    })

    await t.test('pluggableStream', async () => {
        // This is a class inside the file, but not exported.
        // We can test it via createServer or connect if we mock net.
    })

    await t.test('connect', async () => {
        // Exercise the `new tls.connect` bug
        // We can't easily catch the 'new' keyword usage without proxying tls.connect
        assert.strictEqual(typeof tls_socket.connect, 'function')
    })

    await t.test('connect upgrade error propagation', async (t) => {
        // Verify that TLS errors during socket.upgrade() are propagated to the outer
        // pluggableStream socket, not silently swallowed.
        // A TLS server that requires a client cert; connecting without one triggers
        // a post-handshake "certificate required" alert (TLSv1.3).
        await t.test('emits error on outer socket when client cert is missing', async () => {
            const server = tls.createServer(
                { cert: TEST_CERT, key: TEST_KEY, requestCert: true, rejectUnauthorized: true },
                () => {},
            )
            await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
            const { port } = server.address()

            try {
                const err = await new Promise((resolve, reject) => {
                    const socket = tls_socket.connect({ host: '127.0.0.1', port })
                    socket.upgrade({ rejectUnauthorized: false }, () => {})
                    socket.on('error', resolve)
                    socket.on('close', () => reject(new Error('closed without error')))
                    setTimeout(() => reject(new Error('timeout')), 3000)
                })
                assert.ok(
                    /certificate required|socket hang up|disconnected/.test(err.message),
                    `unexpected error: ${err.message}`,
                )
                assert.equal(err.source, 'tls', 'error.source should be "tls"')
            } finally {
                await new Promise((resolve) => server.close(resolve))
            }
        })

        await t.test('closes the socket with a tls error when the context cannot be built', async () => {
            const peers = []
            const server = net.createServer((peer) => peers.push(peer))
            const socket = tls_socket.connect({ host: '127.0.0.1', port: await listen(server) })

            try {
                await once(socket, 'connect')
                const errors = []
                socket.on('error', (err) => errors.push(err))
                const closed = new Promise((resolve) => socket.once('close', () => resolve('closed')))

                assert.doesNotThrow(() => socket.upgrade({ key: 'not a key', cert: 'not a cert' }, () => {}))
                assert.equal(await Promise.race([closed, sleep(1000, 'left open')]), 'closed')
                assert.equal(errors[0]?.source, 'tls')
            } finally {
                for (const peer of peers) peer.destroy()
                await new Promise((resolve) => server.close(resolve))
            }
        })

        await t.test('second error handler does not crash when first handler removes all listeners', () => {
            // Regression test for issue #3553
            const originalNetConnect = net.connect
            const originalTlsConnect = tls.connect
            const originalTlsValid = tls_socket.tls_valid

            const fakeCrypto = new EventEmitter()
            fakeCrypto.writable = true
            fakeCrypto.removeAllListeners = EventEmitter.prototype.removeAllListeners
            fakeCrypto.setTimeout = () => {}
            fakeCrypto.setKeepAlive = () => {}

            let capturedCleartext
            net.connect = () => fakeCrypto
            tls.connect = () => {
                capturedCleartext = new EventEmitter()
                capturedCleartext.writable = true
                capturedCleartext.setTimeout = () => {}
                capturedCleartext.setKeepAlive = () => {}
                return capturedCleartext
            }
            tls_socket.tls_valid = false

            try {
                const socket = tls_socket.connect({ host: 'bad-tls.example.com', port: 25 })

                // Simulate what release_client does: strip all listeners on first error
                socket.once('error', () => socket.removeAllListeners())

                socket.upgrade({}, () => {})

                // capturedCleartext now has two 'error' handlers (on from upgrade, once from attach).
                // Emitting error must NOT throw even though the first handler removes all
                // listeners from the outer socket before the second fires.
                const tlsError = new Error('dh key too small')
                assert.doesNotThrow(() => capturedCleartext.emit('error', tlsError))
            } finally {
                net.connect = originalNetConnect
                tls.connect = originalTlsConnect
                tls_socket.tls_valid = originalTlsValid
            }
        })
    })

    await t.test('getSocketOpts', async () => {
        // Exercise the typo path (would requires failing config.getDir)
        assert.strictEqual(typeof tls_socket.getSocketOpts, 'function')
    })

    await t.test('getSocketOpts handles missing tls dir', async () => {
        const originalGetCertsDir = tls_socket.get_certs_dir
        tls_socket.get_certs_dir = async () => {
            const err = new Error('missing')
            err.code = 'ENOENT'
            throw err
        }
        try {
            const opts = await tls_socket.getSocketOpts('*')
            assert.ok(opts)
        } finally {
            tls_socket.get_certs_dir = originalGetCertsDir
        }
    })

    await t.test('connect upgrade applies mutual auth cert, timeout/keepalive and a reused context', async () => {
        const originalNetConnect = net.connect
        const originalTlsConnect = tls.connect
        const originalTlsValid = tls_socket.tls_valid
        const originalCfg = tls_socket.cfg
        const originalCertMap = {
            default: tls_socket.certsByHost['*'],
            host: tls_socket.certsByHost['client-cert.example'],
        }

        const fakeSocket = new EventEmitter()
        fakeSocket.remotePort = 2525
        fakeSocket.remoteAddress = '127.0.0.1'
        fakeSocket.localPort = 25
        fakeSocket.localAddress = '127.0.0.1'
        fakeSocket.writable = true
        fakeSocket.removeAllListeners = EventEmitter.prototype.removeAllListeners
        fakeSocket.setTimeout = () => {}
        fakeSocket.setKeepAlive = () => {}

        let capturedOptions
        let timeoutSeen = null
        let keepaliveSeen = null

        net.connect = () => fakeSocket
        tls.connect = (options) => {
            capturedOptions = options
            const clear = new EventEmitter()
            clear.writable = true
            clear.getCipher = () => ({ name: 'TLS_AES_256_GCM_SHA384' })
            clear.getProtocol = () => 'TLSv1.3'
            clear.getPeerCertificate = () => ({})
            clear.setTimeout = (ms) => {
                timeoutSeen = ms
            }
            clear.setKeepAlive = (value) => {
                keepaliveSeen = value
            }
            process.nextTick(() => clear.emit('secureConnect'))
            return clear
        }

        tls_socket.tls_valid = true
        tls_socket.cfg = {
            mutual_auth_hosts: { 'mx.example.com': 'client-cert.example' },
            mutual_auth_hosts_exclude: {},
            main: { mutual_tls: false },
        }
        const hostKey = Buffer.from(TEST_KEY)
        const hostCert = Buffer.from(TEST_CERT)
        tls_socket.certsByHost['*'] = { key: TEST_KEY, cert: TEST_CERT }
        tls_socket.certsByHost['client-cert.example'] = { key: hostKey, cert: hostCert }

        try {
            const socket = tls_socket.connect({ host: 'mx.example.com', port: 25 })
            socket.setTimeout(3210)
            socket.setKeepAlive(true)

            await new Promise((resolve) => {
                socket.upgrade({ rejectUnauthorized: false }, () => resolve())
            })

            assert.equal(capturedOptions.key, hostKey)
            assert.equal(capturedOptions.cert, hostCert)
            assert.equal(capturedOptions.socket, fakeSocket)
            assert.equal(timeoutSeen, 3210)
            assert.equal(keepaliveSeen, true)

            const { secureContext } = capturedOptions
            assert.ok(secureContext, 'upgrade passes a secureContext')
            const again = tls_socket.connect({ host: 'mx.example.com', port: 25 })
            await new Promise((resolve) => {
                again.upgrade({ rejectUnauthorized: false }, () => resolve())
            })
            assert.equal(capturedOptions.secureContext, secureContext)
        } finally {
            net.connect = originalNetConnect
            tls.connect = originalTlsConnect
            tls_socket.tls_valid = originalTlsValid
            tls_socket.cfg = originalCfg
            tls_socket.certsByHost['*'] = originalCertMap.default
            if (originalCertMap.host === undefined) {
                delete tls_socket.certsByHost['client-cert.example']
            } else {
                tls_socket.certsByHost['client-cert.example'] = originalCertMap.host
            }
        }
    })

    await t.test('clientSecureContext', async (t) => {
        const base = { key: TEST_KEY, cert: TEST_CERT, minVersion: 'TLSv1.2' }

        await t.test('reuses a context across hosts and socket options', () => {
            const a = tls_socket.clientSecureContext({ ...base, servername: 'a.example', rejectUnauthorized: false })
            const b = tls_socket.clientSecureContext({ ...base, servername: 'b.example', rejectUnauthorized: true })
            assert.equal(a, b)
        })

        await t.test('builds a new context when any other option differs', () => {
            const a = tls_socket.clientSecureContext(base)
            assert.notEqual(tls_socket.clientSecureContext({ ...base, cert: Buffer.from(TEST_CERT) }), a)
            assert.notEqual(tls_socket.clientSecureContext({ ...base, minVersion: 'TLSv1.3' }), a)
            assert.notEqual(tls_socket.clientSecureContext({ ...base, maxVersion: 'TLSv1.2' }), a)
        })

        await t.test('evicts the least recently used context', () => {
            const miss = () => tls_socket.clientSecureContext({ ...base, cert: Buffer.from(TEST_CERT) })
            const a = tls_socket.clientSecureContext(base)
            for (let i = 0; i < 15; i++) miss()
            assert.equal(tls_socket.clientSecureContext(base), a)
            miss()
            assert.equal(tls_socket.clientSecureContext(base), a)
        })
    })

    await t.test('load_tls_ini', async (t) => {
        const origConfig = tls_socket.config
        const origCfg = tls_socket.cfg

        t.after(() => {
            tls_socket.config = origConfig
            tls_socket.cfg = origCfg
        })

        // A tls.ini with none of the host sections makes every fallback fire. The maps
        // are indexed by hostname, so an inherited Object.prototype member such as
        // 'constructor' must not read as a configured host (GHSA-xf4w-8v5p-24pc class).
        await t.test('host maps fall back to null-prototype objects', () => {
            tls_socket.config = require('haraka-config').module_config(path.join(__dirname, 'no_such_dir'))
            tls_socket.cfg = undefined
            const cfg = tls_socket.load_tls_ini({ role: 'client' })

            for (const map of ['no_tls_hosts', 'mutual_auth_hosts', 'mutual_auth_hosts_exclude']) {
                assert.equal(Object.getPrototypeOf(cfg[map]), null, `${map} has no prototype`)
                for (const name of ['constructor', '__proto__']) {
                    assert.equal(cfg[map][name], undefined, `${map}['${name}'] is not a configured host`)
                }
            }
        })
    })

    await t.test('load_plugin_tls_options', async (t) => {
        // Point haraka-config at test/config so tls.ini fixtures load.
        const origConfig = tls_socket.config
        const origCfg = tls_socket.cfg
        const test_config = require('haraka-config').module_config(path.resolve(__dirname))

        t.beforeEach(() => {
            tls_socket.config = test_config
            tls_socket.cfg = undefined // bust load_tls_ini cache between cases
        })

        t.after(() => {
            tls_socket.config = origConfig
            tls_socket.cfg = origCfg
        })

        await t.test('inherits tls.ini [main] when plugin cfg is empty', () => {
            const opts = tls_socket.load_plugin_tls_options({})
            // From test/config/tls.ini [main]
            assert.equal(opts.rejectUnauthorized, false)
            assert.equal(opts.minVersion, 'TLSv1')
            assert.equal(opts.honorCipherOrder, true)
            assert.ok(opts.ciphers && opts.ciphers.length)
            assert.ok(Buffer.isBuffer(opts.key), 'key resolved to Buffer')
            assert.ok(Buffer.isBuffer(opts.cert), 'cert resolved to Buffer')
        })

        await t.test('plugin cfg overrides [main]', () => {
            const opts = tls_socket.load_plugin_tls_options({
                rejectUnauthorized: true,
                minVersion: 'TLSv1.3',
                ciphers: 'ECDHE-RSA-AES256-GCM-SHA384',
            })
            assert.equal(opts.rejectUnauthorized, true)
            assert.equal(opts.minVersion, 'TLSv1.3')
            assert.equal(opts.ciphers, 'ECDHE-RSA-AES256-GCM-SHA384')
        })

        await t.test('resolves key/cert/dhparam file refs to Buffers', () => {
            const opts = tls_socket.load_plugin_tls_options({
                key: 'outbound_tls_key.pem',
                cert: 'outbound_tls_cert.pem',
                dhparam: 'dhparams.pem',
            })
            assert.ok(Buffer.isBuffer(opts.key) && opts.key.length > 0)
            assert.ok(Buffer.isBuffer(opts.cert) && opts.cert.length > 0)
            assert.ok(Buffer.isBuffer(opts.dhparam) && opts.dhparam.length > 0)
        })

        await t.test('drops missing dhparam rather than leaving null', () => {
            const opts = tls_socket.load_plugin_tls_options({
                dhparam: 'does_not_exist.pem',
            })
            assert.equal(opts.dhparam, undefined)
        })

        await t.test('normalises no_tls_hosts / force_tls_hosts to arrays', () => {
            const opts = tls_socket.load_plugin_tls_options({
                no_tls_hosts: '10.0.0.5',
                force_tls_hosts: ['a.example.com', 'b.example.com'],
            })
            assert.deepEqual(opts.no_tls_hosts, ['10.0.0.5'])
            assert.deepEqual(opts.force_tls_hosts, ['a.example.com', 'b.example.com'])

            const opts2 = tls_socket.load_plugin_tls_options({})
            assert.deepEqual(opts2.no_tls_hosts, [])
            assert.deepEqual(opts2.force_tls_hosts, [])
        })

        await t.test('does not set servername', () => {
            const opts = tls_socket.load_plugin_tls_options({})
            assert.equal(opts.servername, undefined)
        })

        await t.test('does not mutate the input plugin cfg', () => {
            const input = { rejectUnauthorized: true, no_tls_hosts: '10.0.0.5' }
            const before = JSON.stringify(input)
            tls_socket.load_plugin_tls_options(input)
            assert.equal(JSON.stringify(input), before)
        })
    })

    await t.test('with test/config tls.ini', async (t) => {
        const origConfig = tls_socket.config
        const origCfg = tls_socket.cfg
        const servers = []

        t.before(() => {
            tls_socket.config = require('haraka-config').module_config(path.resolve(__dirname))
            tls_socket.cfg = undefined
            tls_socket.load_tls_ini()
        })

        t.after(async () => {
            for (const server of servers) await new Promise((resolve) => server.close(resolve))
            tls_socket.config = origConfig
            tls_socket.cfg = origCfg
        })

        const startTlsPort = () => {
            const server = tls_socket.createServer((socket) => {
                socket.on('error', () => {})
                socket.upgrade(() => socket.write('220 secured\r\n'))
            })
            servers.push(server)
            return listen(server)
        }

        const handshake = (port, session) =>
            new Promise((resolve) => {
                const client = tls.connect({ port, host: '127.0.0.1', rejectUnauthorized: false, session })
                const result = {}
                const done = () => {
                    client.destroy()
                    resolve(result)
                }
                client.on('session', (ticket) => {
                    result.ticket ??= ticket
                    if (result.reused !== undefined) done()
                })
                client.once('data', () => {
                    result.reused = client.isSessionReused()
                    if (session || result.ticket) done()
                })
                client.once('error', (err) => {
                    result.err = err
                    done()
                })
            })

        await t.test(
            'a requireAuthorized STARTTLS port refuses a ticket from another port',
            { timeout: 5000 },
            async () => {
                const openPort = await startTlsPort()
                const strictPort = await startTlsPort()
                const origRequireAuthorized = tls_socket.cfg.main.requireAuthorized
                tls_socket.cfg.main.requireAuthorized = [strictPort]

                try {
                    const { ticket } = await handshake(openPort)
                    assert.ok(ticket, 'the open port issued no ticket')
                    const { err } = await handshake(strictPort, ticket)
                    assert.ok(err, 'resumed without a client cert')
                } finally {
                    tls_socket.cfg.main.requireAuthorized = origRequireAuthorized
                }
            },
        )

        await t.test('STARTTLS with an unloadable key closes the connection', { timeout: 5000 }, async () => {
            const serverErrors = []
            let upgradeThrew = false
            const server = tls_socket.createServer((socket) => {
                socket.on('error', (err) => serverErrors.push(err))
                try {
                    socket.upgrade(() => socket.write('220 secured\r\n'))
                } catch {
                    upgradeThrew = true
                }
            })
            const rawSockets = []
            server.on('connection', (socket) => rawSockets.push(socket))
            servers.push(server)
            const port = await listen(server)

            try {
                tls_socket.certsByHost.set('*.key', ['missing_key.pem'])
                tls_socket.load_default_opts()
                const client = tls.connect({ port, host: '127.0.0.1', rejectUnauthorized: false })
                client.on('error', () => {})
                const outcome = await Promise.race([
                    new Promise((resolve) => client.once('data', () => resolve('served'))),
                    new Promise((resolve) => client.once('close', () => resolve('closed'))),
                    sleep(1000, 'left open'),
                ])
                client.destroy()
                assert.equal(upgradeThrew, false)
                assert.equal(outcome, 'closed')
                assert.equal(serverErrors[0]?.source, 'tls')
            } finally {
                for (const socket of rawSockets) socket.destroy()
                tls_socket.cfg = undefined
                tls_socket.load_tls_ini()
            }
        })

        await t.test('an SNI cert from config/tls sends its intermediates', { timeout: 5000 }, async () => {
            await tls_socket.get_certs_dir('tls-chain')
            const serverOpts = { key: TEST_KEY, cert: TEST_CERT, SNICallback: tls_socket.SNICallback }
            const server = tls.createServer(serverOpts, (socket) => socket.end())
            servers.push(server)
            const port = await listen(server)

            const peer = await new Promise((resolve, reject) => {
                const client = tls.connect({
                    port,
                    host: '127.0.0.1',
                    servername: 'chain.example.net',
                    rejectUnauthorized: false,
                })
                client.once('error', reject)
                client.once('secureConnect', () => {
                    resolve(client.getPeerCertificate(true))
                    client.destroy()
                })
            })

            assert.equal(peer.subject.CN, 'chain.example.net')
            assert.equal(peer.issuerCertificate?.subject.CN, 'Haraka Test Intermediate')
        })

        await t.test('connect presents the mutual TLS client cert on every connection', { timeout: 5000 }, async () => {
            const serverOpts = { key: TEST_KEY, cert: TEST_CERT, requestCert: true, rejectUnauthorized: false }
            const server = tls.createServer(serverOpts, (socket) => {
                socket.end(`${socket.getPeerCertificate().subject?.O}\r\n`)
            })
            servers.push(server)
            const port = await listen(server)
            const origMutualTls = tls_socket.cfg.main.mutual_tls
            tls_socket.cfg.main.mutual_tls = true

            const peerOrganization = () =>
                new Promise((resolve, reject) => {
                    const socket = tls_socket.connect({ host: '127.0.0.1', port })
                    socket.once('error', reject)
                    socket.upgrade({ rejectUnauthorized: false })
                    socket.once('data', (data) => resolve(data.toString().trim()))
                })

            try {
                assert.equal(await peerOrganization(), 'Internet Widgits Pty Ltd')
                assert.equal(await peerOrganization(), 'Internet Widgits Pty Ltd')
            } finally {
                tls_socket.cfg.main.mutual_tls = origMutualTls
            }
        })
    })
})
