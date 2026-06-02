'use strict'

const { describe, it, beforeEach, afterEach } = require('node:test')
const assert = require('node:assert/strict')
const { createHmac } = require('node:crypto')
const net = require('node:net')
const { once } = require('node:events')
const path = require('node:path')
const tls = require('node:tls')
const constants = require('haraka-constants')
const net_utils = require('haraka-net-utils')

const { endpoint } = require('haraka-net-utils')
const message = require('haraka-email-message')
const { get_client } = require('../smtp_client')

function fixtureConfig(name) {
    const testRoot = path.resolve('test')
    return require('haraka-config').module_config(testRoot, path.resolve('test/fixtures', name))
}

function useHaproxyFixture(server, name) {
    const originalConfig = net_utils.config
    const originalConnectionCfg = server.connection.cfg
    const config = fixtureConfig(name)
    net_utils.config = config
    server.connection.cfg = config.get('connection.ini', { booleans: ['+haproxy.enabled'] })
    return () => {
        net_utils.config = originalConfig
        server.connection.cfg = originalConnectionCfg
    }
}

// ─── CRAM-MD5 helper ──────────────────────────────────────────────────────────

/** Compute a CRAM-MD5 response to a server challenge. */
const cramMd5Response = (user, pass, challenge) => {
    const decoded = Buffer.from(challenge, 'base64').toString()
    const hmac = createHmac('md5', pass).update(decoded).digest('hex')
    return Buffer.from(`${user} ${hmac}`).toString('base64')
}

// ─── Server lifecycle helpers ─────────────────────────────────────────────────

const setupServer = (ip_port) =>
    new Promise((resolve) => {
        process.env.YES_REALLY_DO_DISCARD = '1'
        process.env.HARAKA_TEST_DIR = path.resolve('test')
        const test_cfg_path = path.resolve('test')

        this.server = require('../server')
        this.config = require('haraka-config').module_config(test_cfg_path)
        this.server.logger.loglevel = 6
        this.server.config = this.config.module_config(test_cfg_path)
        this.server.plugins.config = this.config.module_config(test_cfg_path)

        this.server.load_smtp_ini()
        this.server.cfg.main.listen = ip_port
        this.server.cfg.main.smtps_port = 2465

        this.server.load_default_tls_config(() => {
            this.server.createServer({})
            setTimeout(resolve, 200)
        })
    })

const tearDownServer = () =>
    new Promise((resolve) => {
        delete process.env.YES_REALLY_DO_DISCARD
        delete process.env.HARAKA_TEST_DIR
        this.server.stopListeners()
        this.server.plugins.registered_hooks = {}
        setTimeout(resolve, 200)
    })

// ─── SMTP session helper ──────────────────────────────────────────────────────

/**
 * Deliver a message via smtp_client and return a Promise that resolves on
 * acceptance (dot event) or rejects on any SMTP error (bad_code event).
 *
 * When `user`/`pass` are provided, CRAM-MD5 authentication is performed
 * before sending the message.
 */
const sendMessage = ({
    host = '127.0.0.1',
    port,
    from = '<test@haraka.local>',
    to = '<discard@haraka.local>',
    user,
    pass,
    body = 'Hello from smtp_client test',
} = {}) =>
    new Promise((resolve, reject) => {
        get_client(
            { notes: {} },
            (client) => {
                let credsSent = false

                client
                    .on('greeting', (cmd) => client.send_command(cmd, host))
                    .on('helo', () => {
                        if (user && !credsSent) {
                            client.authenticating = true
                            client.send_command('AUTH', 'CRAM-MD5')
                        } else {
                            client.send_command('MAIL', `FROM:${from}`)
                        }
                    })
                    .on('auth', () => {
                        if (client.authenticated) {
                            client.send_command('MAIL', `FROM:${from}`)
                        } else if (!credsSent) {
                            credsSent = true
                            const resp = cramMd5Response(user, pass, client.response[0])
                            // Write CRAM-MD5 response directly (no command prefix)
                            client.command = 'auth'
                            client.response = []
                            client.socket.write(`${resp}\r\n`)
                        }
                    })
                    .on('mail', () => client.send_command('RCPT', `TO:${to}`))
                    .on('rcpt', () => client.send_command('DATA'))
                    .on('data', () => {
                        const stream = new message.stream({ main: { spool_after: 1024 } }, 'testId')
                        stream.on('end', () => client.socket.write('.\r\n'))
                        stream.add_line('Subject: test\r\n')
                        stream.add_line('\r\n')
                        stream.add_line(`${body}\r\n`)
                        stream.add_line_end()
                        client.start_data(stream)
                    })
                    .on('dot', () => {
                        client.release()
                        resolve()
                    })
                    .on('bad_code', (code, msg) => {
                        client.release()
                        reject(new Error(`${code} ${msg}`))
                    })
            },
            { host, port, connect_timeout: 5 },
        )
    })

const listen = (server, host = '127.0.0.1') =>
    new Promise((resolve, reject) => {
        server.once('error', reject)
        server.listen(0, host, () => {
            server.removeListener('error', reject)
            resolve()
        })
    })

const close = (server) =>
    new Promise((resolve) => {
        server.close(resolve)
    })

const withTimeout = (promise, ms, msg) =>
    new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(msg)), ms)
        promise.then(
            (result) => {
                clearTimeout(timer)
                resolve(result)
            },
            (err) => {
                clearTimeout(timer)
                reject(err)
            },
        )
    })

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('server', () => {
    // ── get_listen_addrs ──────────────────────────────────────────────────────
    describe('get_listen_addrs', () => {
        beforeEach(() => {
            this.config = require('haraka-config')
            this.server = require('../server')
        })

        const cases = [
            {
                desc: 'IPv4 fully qualified',
                args: [{ listen: '127.0.0.1:25' }],
                expected: ['127.0.0.1:25'],
            },
            {
                desc: 'IPv4, default port',
                args: [{ listen: '127.0.0.1' }],
                expected: ['127.0.0.1:25'],
            },
            {
                desc: 'IPv4, custom port',
                args: [{ listen: '127.0.0.1' }, 250],
                expected: ['127.0.0.1:250'],
            },
            {
                desc: 'IPv6 fully qualified',
                args: [{ listen: '[::1]:25' }],
                expected: ['[::1]:25'],
            },
            {
                desc: 'IPv6, default port',
                args: [{ listen: '[::1]' }],
                expected: ['[::1]:25'],
            },
            {
                desc: 'IPv6, custom port',
                args: [{ listen: '[::1]' }, 250],
                expected: ['[::1]:250'],
            },
            {
                desc: 'IPv4 & IPv6 fully qualified',
                args: [{ listen: '127.0.0.1:25,[::1]:25' }],
                expected: ['127.0.0.1:25', '[::1]:25'],
            },
            {
                desc: 'IPv4 & IPv6, default port',
                args: [{ listen: '127.0.0.1:25,[::1]' }],
                expected: ['127.0.0.1:25', '[::1]:25'],
            },
            {
                desc: 'IPv4 & IPv6, custom port',
                args: [{ listen: '127.0.0.1,[::1]' }, 250],
                expected: ['127.0.0.1:250', '[::1]:250'],
            },
        ]

        for (const { desc, args, expected } of cases) {
            it(desc, () => {
                assert.deepEqual(this.server.get_listen_addrs(...args), expected)
            })
        }
    })

    // ── load_smtp_ini ─────────────────────────────────────────────────────────
    describe('load_smtp_ini', () => {
        beforeEach(() => {
            this.config = require('haraka-config')
            this.server = require('../server')
        })

        it('saves settings to Server.cfg', () => {
            this.server.load_smtp_ini()
            const c = this.server.cfg.main
            assert.notEqual(c.daemonize, undefined)
            assert.notEqual(c.daemon_log_file, undefined)
            assert.notEqual(c.daemon_pid_file, undefined)
        })
    })

    // ── get_smtp_server ───────────────────────────────────────────────────────
    describe('get_smtp_server', () => {
        beforeEach(async () => {
            this.config = require('haraka-config').module_config(path.resolve('test'))
            this.server = require('../server')
            this.server.config = this.config
            this.server.plugins.config = this.config
            await new Promise((resolve) => {
                this.server.load_default_tls_config(() => setTimeout(resolve, 200))
            })
        })

        it('gets a net server object', async () => {
            const server = await this.server.get_smtp_server(endpoint('0.0.0.0:2501'), 10)
            if (!server) {
                if (process.env.CI) return
                assert.fail('unable to bind to 0.0.0.0:2501')
            }
            assert.ok(server)
            assert.equal(server.has_tls, false)
            const count = await new Promise((res) => server.getConnections((err, n) => res(n)))
            assert.equal(count, 0)
        })

        it('gets a TLS net server object', async () => {
            this.server.cfg.main.smtps_port = 2502
            const server = await this.server.get_smtp_server(endpoint('0.0.0.0:2502'), 10)
            if (!server) {
                if (process.env.CI) return
                assert.fail('unable to bind to 0.0.0.0:2502')
            }
            assert.ok(server)
            assert.equal(server.has_tls, true)
            const count = await new Promise((res) => server.getConnections((err, n) => res(n)))
            assert.equal(count, 0)
        })

        it('accepts PROXY v1 before the SMTPS TLS handshake', async () => {
            const restoreHaproxyConfig = useHaproxyFixture(this.server, 'haproxy_allowed')
            this.server.cfg.main.smtps_port = 0

            // PROXY-before-TLS takes slightly longer than the default 10 ms timeout on Windows,
            // use 50 ms timeout to avoid flaky tests (default is 300000 ms).
            const server = await this.server.get_smtp_server(endpoint('127.0.0.1:0'), 50)
            const tlsErrors = []
            let raw
            let client

            server.on('tlsClientError', (err) => {
                tlsErrors.push(err)
            })

            try {
                await listen(server)

                raw = net.connect(server.address().port, '127.0.0.1')
                await withTimeout(
                    Promise.race([
                        once(raw, 'connect'),
                        once(raw, 'error').then(([err]) => {
                            throw err
                        }),
                    ]),
                    3000,
                    'SMTPS TCP connection timed out',
                )

                raw.write('PROXY TCP4 127.0.0.1 127.0.0.1 42310 465\r\n')
                client = tls.connect({
                    socket: raw,
                    rejectUnauthorized: false,
                    servername: 'localhost',
                })

                await withTimeout(
                    Promise.race([
                        once(client, 'secureConnect'),
                        once(client, 'error').then(([err]) => {
                            throw err
                        }),
                    ]),
                    3000,
                    'SMTPS PROXY handshake timed out',
                )
                const [banner] = await withTimeout(once(client, 'data'), 3000, 'SMTPS PROXY banner timed out')
                assert.match(banner.toString(), /^220 /)
                assert.equal(tlsErrors.length, 0)
            } finally {
                if (client) client.destroy()
                else if (raw) raw.destroy()
                await close(server)
                restoreHaproxyConfig()
            }
        })

        it('accepts direct SMTPS from a PROXY-allowed peer', async () => {
            const restoreHaproxyConfig = useHaproxyFixture(this.server, 'haproxy_allowed')
            this.server.cfg.main.smtps_port = 0

            const server = await this.server.get_smtp_server(endpoint('127.0.0.1:0'), 10)
            const tlsErrors = []
            let client

            server.on('tlsClientError', (err) => {
                tlsErrors.push(err)
            })

            try {
                await listen(server)

                client = tls.connect({
                    port: server.address().port,
                    host: '127.0.0.1',
                    rejectUnauthorized: false,
                    servername: 'localhost',
                })

                await withTimeout(
                    Promise.race([
                        once(client, 'secureConnect'),
                        once(client, 'error').then(([err]) => {
                            throw err
                        }),
                    ]),
                    3000,
                    'direct SMTPS handshake timed out',
                )
                const [banner] = await withTimeout(once(client, 'data'), 3000, 'direct SMTPS banner timed out')
                assert.match(banner.toString(), /^220 /)
                assert.equal(tlsErrors.length, 0)
            } finally {
                if (client) client.destroy()
                await close(server)
                restoreHaproxyConfig()
            }
        })

        it('preserves TLS server events for SMTPS connections', async () => {
            this.server.cfg.main.smtps_port = 0

            const server = await this.server.get_smtp_server(endpoint('127.0.0.1:0'), 10)
            let ocspRequests = 0
            let first
            let second

            server.tlsServer.on('OCSPRequest', (cert, issuer, cb) => {
                ocspRequests++
                cb()
            })

            try {
                await listen(server)

                first = tls.connect({
                    port: server.address().port,
                    host: '127.0.0.1',
                    rejectUnauthorized: false,
                    requestOCSP: true,
                    servername: 'localhost',
                    maxVersion: 'TLSv1.2',
                })

                await withTimeout(
                    Promise.race([
                        once(first, 'secureConnect'),
                        once(first, 'error').then(([err]) => {
                            throw err
                        }),
                    ]),
                    3000,
                    'first SMTPS handshake timed out',
                )
                const session = first.getSession()
                first.destroy()
                await withTimeout(once(first, 'close'), 3000, 'first SMTPS close timed out')

                second = tls.connect({
                    port: server.address().port,
                    host: '127.0.0.1',
                    rejectUnauthorized: false,
                    requestOCSP: true,
                    servername: 'localhost',
                    maxVersion: 'TLSv1.2',
                    session,
                })

                await withTimeout(
                    Promise.race([
                        once(second, 'secureConnect'),
                        once(second, 'error').then(([err]) => {
                            throw err
                        }),
                    ]),
                    3000,
                    'resumed SMTPS handshake timed out',
                )

                assert.equal(ocspRequests, 1)
                assert.equal(second.isSessionReused(), true)
            } finally {
                if (second) second.destroy()
                if (first) first.destroy()
                await close(server)
            }
        })

        it('uses direct TLS for SMTPS when HAProxy support is disabled', async () => {
            const restoreHaproxyConfig = useHaproxyFixture(this.server, 'haproxy_disabled')
            this.server.cfg.main.smtps_port = 0

            let server
            let client

            try {
                server = await this.server.get_smtp_server(endpoint('127.0.0.1:0'), 10)
                assert.equal(server.tlsServer, undefined)

                await listen(server)

                client = tls.connect({
                    port: server.address().port,
                    host: '127.0.0.1',
                    rejectUnauthorized: false,
                    servername: 'localhost',
                })

                await withTimeout(
                    Promise.race([
                        once(client, 'secureConnect'),
                        once(client, 'error').then(([err]) => {
                            throw err
                        }),
                    ]),
                    3000,
                    'direct TLS fallback handshake timed out',
                )
            } finally {
                if (client) client.destroy()
                if (server) await close(server)
                restoreHaproxyConfig()
            }
        })

        it('accepts direct SMTPS from an untrusted PROXY peer', async () => {
            const restoreHaproxyConfig = useHaproxyFixture(this.server, 'haproxy_untrusted')
            this.server.cfg.main.smtps_port = 0

            const server = await this.server.get_smtp_server(endpoint('127.0.0.1:0'), 10)
            let client

            try {
                await listen(server)

                client = tls.connect({
                    port: server.address().port,
                    host: '127.0.0.1',
                    rejectUnauthorized: false,
                    servername: 'localhost',
                })

                await withTimeout(
                    Promise.race([
                        once(client, 'secureConnect'),
                        once(client, 'error').then(([err]) => {
                            throw err
                        }),
                    ]),
                    3000,
                    'untrusted direct SMTPS handshake timed out',
                )
            } finally {
                if (client) client.destroy()
                await close(server)
                restoreHaproxyConfig()
            }
        })

        it('rejects malformed SMTPS PROXY lines before TLS', async () => {
            const restoreHaproxyConfig = useHaproxyFixture(this.server, 'haproxy_allowed')
            this.server.cfg.main.smtps_port = 0

            const server = await this.server.get_smtp_server(endpoint('127.0.0.1:0'), 10)
            let raw

            try {
                await listen(server)

                raw = net.connect(server.address().port, '127.0.0.1')
                await withTimeout(once(raw, 'connect'), 3000, 'malformed PROXY TCP connection timed out')
                raw.write('PROXY TCP4 nope 127.0.0.1 42310 465\r\n')

                const [response] = await withTimeout(once(raw, 'data'), 3000, 'malformed PROXY response timed out')
                assert.match(response.toString(), /^421 Invalid PROXY format/)
            } finally {
                if (raw) raw.destroy()
                await close(server)
                restoreHaproxyConfig()
            }
        })

        it('rejects oversized SMTPS PROXY lines before TLS', async () => {
            const restoreHaproxyConfig = useHaproxyFixture(this.server, 'haproxy_allowed')
            this.server.cfg.main.smtps_port = 0

            const server = await this.server.get_smtp_server(endpoint('127.0.0.1:0'), 10)
            let raw

            try {
                await listen(server)

                raw = net.connect(server.address().port, '127.0.0.1')
                await withTimeout(once(raw, 'connect'), 3000, 'oversized PROXY TCP connection timed out')
                raw.write(`PROXY ${'x'.repeat(513)}`)

                const [response] = await withTimeout(once(raw, 'data'), 3000, 'oversized PROXY response timed out')
                assert.match(response.toString(), /^421 Invalid PROXY format/)
            } finally {
                if (raw) raw.destroy()
                await close(server)
                restoreHaproxyConfig()
            }
        })

        it('times out waiting for SMTPS PROXY from an allowed peer', async () => {
            const restoreHaproxyConfig = useHaproxyFixture(this.server, 'haproxy_allowed')
            const originalSetTimeout = global.setTimeout
            global.setTimeout = (fn, ms, ...args) => originalSetTimeout(fn, ms === 30 * 1000 ? 20 : ms, ...args)
            this.server.cfg.main.smtps_port = 0

            const server = await this.server.get_smtp_server(endpoint('127.0.0.1:0'), 10)
            let raw

            try {
                await listen(server)

                raw = net.connect(server.address().port, '127.0.0.1')
                await withTimeout(once(raw, 'connect'), 3000, 'PROXY timeout TCP connection timed out')

                const [response] = await withTimeout(once(raw, 'data'), 3000, 'PROXY timeout response timed out')
                assert.match(response.toString(), /^421 PROXY timeout/)
            } finally {
                global.setTimeout = originalSetTimeout
                if (raw) raw.destroy()
                await close(server)
                restoreHaproxyConfig()
            }
        })

        it('accepts byte-by-byte direct SMTPS from a PROXY-allowed peer', async () => {
            const restoreHaproxyConfig = useHaproxyFixture(this.server, 'haproxy_allowed')
            this.server.cfg.main.smtps_port = 0

            const server = await this.server.get_smtp_server(endpoint('127.0.0.1:0'), 10)
            let raw
            let client

            try {
                await listen(server)

                raw = net.connect(server.address().port, '127.0.0.1')
                await withTimeout(once(raw, 'connect'), 3000, 'fragmented direct SMTPS TCP connection timed out')

                const write = raw.write.bind(raw)
                raw.write = (chunk, encoding, cb) => {
                    if (typeof encoding === 'function') {
                        cb = encoding
                        encoding = undefined
                    }
                    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, encoding)
                    let pos = 0
                    const write_next = () => {
                        if (pos >= buffer.length) {
                            if (cb) cb()
                            return
                        }
                        write(buffer.subarray(pos, pos + 1))
                        pos++
                        setImmediate(write_next)
                    }
                    write_next()
                    return true
                }

                client = tls.connect({
                    socket: raw,
                    rejectUnauthorized: false,
                    servername: 'localhost',
                })

                await withTimeout(
                    Promise.race([
                        once(client, 'secureConnect'),
                        once(client, 'error').then(([err]) => {
                            throw err
                        }),
                    ]),
                    3000,
                    'fragmented direct SMTPS handshake timed out',
                )
                const [banner] = await withTimeout(
                    once(client, 'data'),
                    3000,
                    'fragmented direct SMTPS banner timed out',
                )
                assert.match(banner.toString(), /^220 /)
            } finally {
                if (client) client.destroy()
                else if (raw) raw.destroy()
                await close(server)
                restoreHaproxyConfig()
            }
        })
    })

    // ── get_http_docroot ──────────────────────────────────────────────────────
    describe('get_http_docroot', () => {
        beforeEach(() => {
            this.config = require('haraka-config')
            this.server = require('../server')
        })

        it('gets a fs path', () => {
            assert.ok(this.server.get_http_docroot())
        })
    })

    describe('lifecycle helpers', () => {
        beforeEach(() => {
            this.server = require('../server')
            this.server.cfg = this.server.cfg || { main: {} }
            this.server.cfg.main = this.server.cfg.main || {}
        })

        it('init_child_respond OK path starts HTTP listeners', () => {
            let called = 0
            const original = this.server.setup_http_listeners
            this.server.setup_http_listeners = () => {
                called++
            }
            try {
                this.server.init_child_respond(constants.ok)
                assert.equal(called, 1)
            } finally {
                this.server.setup_http_listeners = original
            }
        })

        it('init_child_respond error path kills master and exits', () => {
            process.env.CLUSTER_MASTER_PID = '12345'
            const originalKill = process.kill
            const originalDump = this.server.logger.dump_and_exit
            let killed = null
            let exitCode = null
            process.kill = (pid) => {
                killed = pid
            }
            this.server.logger.dump_and_exit = (code) => {
                exitCode = code
            }
            try {
                this.server.init_child_respond(constants.deny, 'nope')
                assert.equal(killed, '12345')
                assert.equal(exitCode, 1)
            } finally {
                process.kill = originalKill
                this.server.logger.dump_and_exit = originalDump
                delete process.env.CLUSTER_MASTER_PID
            }
        })

        it('listening applies configured uid/gid and marks ready', () => {
            this.server.cfg.main.group = 'staff'
            this.server.cfg.main.user = 'nobody'
            const originalGetGid = process.getgid
            const originalSetGid = process.setgid
            const originalGetUid = process.getuid
            const originalSetUid = process.setuid
            const calls = { setgid: 0, setuid: 0 }
            process.getgid = () => 20
            process.setgid = () => {
                calls.setgid++
            }
            process.getuid = () => 501
            process.setuid = () => {
                calls.setuid++
            }
            try {
                this.server.listening()
                assert.equal(calls.setgid, 1)
                assert.equal(calls.setuid, 1)
                assert.equal(this.server.ready, 1)
            } finally {
                process.getgid = originalGetGid
                process.setgid = originalSetGid
                process.getuid = originalGetUid
                process.setuid = originalSetUid
                delete this.server.cfg.main.group
                delete this.server.cfg.main.user
            }
        })

        it('sendToMaster calls receiveAsMaster when not clustered', () => {
            const originalCluster = this.server.cluster
            const originalReceive = this.server.receiveAsMaster
            const seen = []
            this.server.cluster = null
            this.server.receiveAsMaster = (cmd, params) => {
                seen.push([cmd, params])
            }
            try {
                this.server.sendToMaster('flushQueue', ['example.com'])
                assert.deepEqual(seen[0], ['flushQueue', ['example.com']])
            } finally {
                this.server.cluster = originalCluster
                this.server.receiveAsMaster = originalReceive
            }
        })

        it('receiveAsMaster ignores invalid commands and executes valid ones', () => {
            const errors = []
            const originalLogError = this.server.logerror
            this.server.logerror = (msg) => errors.push(msg)
            this.server._testCommand = (a, b) => {
                this.server.notes.received = [a, b]
            }
            try {
                this.server.receiveAsMaster('notACommand', [])
                assert.equal(errors.length > 0, true)

                this.server.receiveAsMaster('_testCommand', ['x', 'y'])
                assert.deepEqual(this.server.notes.received, ['x', 'y'])
            } finally {
                this.server.logerror = originalLogError
                delete this.server._testCommand
            }
        })
    })

    describe('HTTP helpers', () => {
        beforeEach(() => {
            this.server = require('../server')
        })

        it('handle404 serves html/json/text based on request accepts', () => {
            const makeReq = (kind) => ({
                accepts(type) {
                    return type === kind
                },
            })
            const responses = []
            const makeRes = () => ({
                status(code) {
                    responses.push({ code })
                    return this
                },
                sendFile(name, opts) {
                    responses.push({ type: 'html', name, opts })
                },
                send(body) {
                    responses.push({ type: 'body', body })
                },
            })

            this.server.handle404(makeReq('html'), makeRes())
            this.server.handle404(makeReq('json'), makeRes())
            this.server.handle404(makeReq('none'), makeRes())

            assert.equal(responses[0].code, 404)
            assert.equal(responses[1].type, 'html')
            assert.equal(responses[3].type, 'body')
            assert.deepEqual(responses[3].body, { err: 'Not found' })
            assert.equal(responses[5].body, 'Not found!')
        })

        it('init_http_respond logs and returns when ws is unavailable', () => {
            const Module = require('node:module')
            const originalRequire = Module.prototype.require
            const originalLogError = this.server.logerror
            const errors = []
            this.server.logerror = (msg) => {
                errors.push(msg)
            }
            this.server.http = { server: {} }
            Module.prototype.require = function (id) {
                if (id === 'ws') throw new Error('ws missing')
                return originalRequire.apply(this, arguments)
            }
            try {
                this.server.init_http_respond()
                assert.equal(errors.length > 0, true)
            } finally {
                Module.prototype.require = originalRequire
                this.server.logerror = originalLogError
            }
        })
    })

    // ── SMTP sessions ─────────────────────────────────────────────────────────
    describe('SMTP sessions', () => {
        beforeEach(async () => setupServer('127.0.0.1:2503'))
        afterEach(async () => tearDownServer())

        it('accepts plain SMTP message', async () => {
            await sendMessage({ port: 2503 })
        })

        it('accepts CRAM-MD5 authenticated SMTP', async () => {
            await sendMessage({ port: 2503, user: 'matt', pass: 'goodPass' })
        })

        it('rejects invalid CRAM-MD5 credentials', async () => {
            await assert.rejects(() => sendMessage({ port: 2503, user: 'matt', pass: 'badPass' }), /5\d\d/)
        })

        it('accepts message with custom headers', async () => {
            await sendMessage({
                port: 2503,
                from: '<sender@haraka.local>',
                to: '<discard@haraka.local>',
                body: 'X-Custom: test-value\r\n\r\nBody text',
            })
        })
    })

    // ── requireAuthorized: SMTPS (implicit TLS) ───────────────────────────────
    describe('requireAuthorized_SMTPS', () => {
        beforeEach(async () => setupServer('127.0.0.1:2465'))
        afterEach(async () => tearDownServer())

        it('rejects non-validated SMTPS connection', async () => {
            // Port 2465 is configured as SMTPS with requireAuthorized.
            // In TLSv1.3 the handshake completes (secureConnect fires), then the server
            // sends a post-handshake "certificate required" alert as a socket error.
            const err = await new Promise((resolve) => {
                const socket = tls.connect({
                    host: '127.0.0.1',
                    port: 2465,
                    rejectUnauthorized: false,
                })
                socket.on('error', resolve)
                // secureConnect may fire before the post-handshake alert; keep waiting.
                socket.on('secureConnect', () => {})
                setTimeout(() => {
                    socket.destroy()
                    resolve(new Error('timeout'))
                }, 3000)
            })
            assert.ok(
                /socket hang up|disconnected before secure TLS|alert certificate required/.test(err.message),
                `unexpected error: ${err.message}`,
            )
        })
    })

    // ── requireAuthorized: STARTTLS ───────────────────────────────────────────
    describe('requireAuthorized_STARTTLS', () => {
        beforeEach(async () => setupServer('127.0.0.1:2587'))
        afterEach(async () => tearDownServer())

        it('rejects non-validated STARTTLS connection', async () => {
            // Port 2587 is plain SMTP; requireAuthorized enforces mutual TLS on STARTTLS upgrade.
            // In TLSv1.3 secureConnect fires first, then the server sends a post-handshake
            // "certificate required" alert. Use raw sockets to observe the TLS error.
            // (smtp_client's upgrade path silently swallows the post-upgrade error.)
            const err = await new Promise((resolve) => {
                const sock = net.connect({ host: '127.0.0.1', port: 2587 })
                let state = 'greeting'
                let buf = ''
                sock.on('data', (d) => {
                    buf += d.toString()
                    for (const line of buf.split('\r\n').slice(0, -1)) {
                        buf = buf.slice(line.length + 2)
                        if (line[3] === '-') continue // multi-line continuation
                        if (state === 'greeting') {
                            sock.write('EHLO test\r\n')
                            state = 'ehlo'
                        } else if (state === 'ehlo') {
                            sock.write('STARTTLS\r\n')
                            state = 'starttls'
                        } else if (state === 'starttls') {
                            state = 'tls'
                            const cleartext = tls.connect({ socket: sock, rejectUnauthorized: false })
                            cleartext.on('secureConnect', () => {})
                            cleartext.on('error', resolve)
                            cleartext.on('close', () => resolve(new Error('closed without error')))
                        }
                    }
                })
                sock.on('error', resolve)
                setTimeout(() => resolve(new Error('timeout')), 3000)
            })
            assert.ok(
                /alert certificate required|socket hang up|disconnected/.test(err.message),
                `unexpected error: ${err.message}`,
            )
        })
    })
})

describe('_graceful (cluster restart)', () => {
    it('actually disconnects workers (queued thunks are invoked)', async () => {
        const cluster = require('node:cluster')
        const Server = require('../server')
        Server.cfg = Server.cfg || { main: {} }
        Server.cfg.main = Server.cfg.main || {}
        Server.cfg.main.force_shutdown_timeout = 1

        const saved = {
            cluster: Server.cluster,
            workers: cluster.workers,
            fork: cluster.fork,
            rmAll: cluster.removeAllListeners,
        }

        let disconnected = 0
        const mkWorker = () => ({
            _cbs: {},
            send() {},
            kill() {},
            once(ev, cb) {
                ;(this._cbs[ev] ||= []).push(cb)
            },
            on(ev, cb) {
                ;(this._cbs[ev] ||= []).push(cb)
            },
            _fire(ev) {
                for (const cb of this._cbs[ev] || []) cb()
            },
            disconnect() {
                disconnected++
                setImmediate(() => {
                    this._fire('disconnect')
                    setImmediate(() => this._fire('exit'))
                })
            },
        })

        cluster.workers = { 1: mkWorker() }
        cluster.removeAllListeners = () => {}
        cluster.fork = () => {
            const nw = mkWorker()
            setImmediate(() => nw._fire('listening'))
            return nw
        }
        Server.cluster = cluster

        try {
            await Server._graceful()
            assert.equal(disconnected, 1, 'worker.disconnect() was invoked')
        } finally {
            Server.cluster = saved.cluster
            cluster.workers = saved.workers
            cluster.fork = saved.fork
            cluster.removeAllListeners = saved.rmAll
        }
    })
})
