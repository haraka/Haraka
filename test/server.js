'use strict'

const { describe, it, beforeEach, afterEach } = require('node:test')
const assert = require('node:assert/strict')
const { createHmac } = require('node:crypto')
const net = require('node:net')
const path = require('node:path')
const tls = require('node:tls')

const endpoint = require('../endpoint')
const message = require('haraka-email-message')
const { get_client } = require('../smtp_client')

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
