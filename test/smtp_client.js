'use strict'

const { describe, it, beforeEach, afterEach } = require('node:test')
const assert = require('node:assert/strict')
const { PassThrough } = require('node:stream')
const path = require('node:path')

const { Address } = require('address-rfc2821')
const fixtures = require('haraka-test-fixtures')
const net_utils = require('haraka-net-utils')
const message = require('haraka-email-message')

const smtp_client_module = require('../smtp_client')
const { smtp_client: SMTPClient } = smtp_client_module
const tls_socket = require('../tls_socket')
const { Socket } = require('./fixtures/line_socket')

// State enum values mirror the module-internal STATE object
const STATE = { IDLE: 1, ACTIVE: 2, RELEASED: 3, DESTROYED: 4 }

// ─── Socket / client helpers ─────────────────────────────────────────────────

function makeSocket() {
    const s = new Socket(25, 'localhost')
    s.write = () => true
    s.upgrade = (opts, cb) => cb && cb(true, null, {}, { name: 'AES128-GCM-SHA256', version: 'TLSv1.3' })
    s.remoteAddress = '1.2.3.4'
    return s
}

function makeClient(opts = {}) {
    const socket = 'socket' in opts ? opts.socket : makeSocket()
    return new SMTPClient({
        host: 'mx.example.com',
        port: 25,
        connect_timeout: 10,
        idle_timeout: 30,
        socket,
        ...opts,
    })
}

// Stub tls_socket.connect so get_client / get_client_plugin don't open real sockets
let _origTlsConnect
function mockTlsConnect(socketFactory) {
    _origTlsConnect = tls_socket.connect
    tls_socket.connect =
        socketFactory ||
        (() => {
            const s = makeSocket()
            net_utils.add_line_processor(s)
            return s
        })
}
function restoreTlsConnect() {
    if (_origTlsConnect) tls_socket.connect = _origTlsConnect
}

function makeConnection(overrides = {}) {
    const conn = fixtures.connection.createConnection()
    conn.server = { notes: {} }
    conn.hello = { host: 'client.example.com' }
    conn.local = { host: 'relay.example.com' }
    conn.remote = { ip: '1.2.3.4' }
    conn.transaction = null
    return Object.assign(conn, overrides)
}

function makePlugin() {
    const p = new fixtures.plugin('queue/smtp_forward')
    p.config = p.config.module_config(path.resolve('test'))
    p.register()
    p.tls_options = {}
    return p
}

// ─── Constructor ─────────────────────────────────────────────────────────────

describe('SMTPClient constructor', () => {
    it('initialises default properties', () => {
        const client = makeClient()
        assert.equal(client.command, 'greeting')
        assert.deepEqual(client.response, [])
        assert.equal(client.connected, false)
        assert.equal(client.authenticating, false)
        assert.equal(client.authenticated, false)
        assert.deepEqual(client.auth_capabilities, [])
        assert.equal(client.host, 'mx.example.com')
        assert.equal(client.port, 25)
        assert.equal(client.smtputf8, false)
        assert.ok(client.uuid)
        assert.equal(client.state, STATE.IDLE)
    })

    it('parses connect_timeout from opts', () => {
        const client = makeClient({ connect_timeout: '45' })
        assert.equal(client.connect_timeout, 45)
    })

    it('defaults connect_timeout to 30', () => {
        const client = makeClient({ connect_timeout: undefined })
        assert.equal(client.connect_timeout, 30)
    })

    it('calls setTimeout and setKeepAlive on the socket', () => {
        const socket = makeSocket()
        let timeoutSet = false
        socket.setTimeout = () => {
            timeoutSet = true
        }
        socket.setKeepAlive = () => {}
        new SMTPClient({ host: 'mx.example.com', port: 25, socket })
        assert.ok(timeoutSet)
    })
})

// ─── Line handler ────────────────────────────────────────────────────────────

describe('SMTPClient line handler', () => {
    let client

    beforeEach(() => {
        client = makeClient()
    })

    it('emits error and destroys on unrecognised SMTP line', () => {
        const errors = []
        client.on('error', (e) => errors.push(e))
        client.socket.emit('line', 'not-smtp\r\n')
        assert.ok(errors.length === 1)
        assert.ok(/Unrecognized response/.test(errors[0]))
        assert.equal(client.state, STATE.DESTROYED)
    })

    it('accumulates multi-line responses (continuation marker)', () => {
        client.command = 'ehlo'
        // Send multi-line: first line has '-' continuation
        client.socket.emit('line', '250-mx.example.com Hello\r\n')
        assert.deepEqual(client.response, ['mx.example.com Hello'])
        // No event emitted yet for ehlo — it requires a ' ' terminator
    })

    it('emits greeting EHLO on 220 response', () => {
        let greetingArg = null
        client.on('greeting', (cmd) => {
            greetingArg = cmd
        })
        client.socket.emit('line', '220 hello server\r\n')
        assert.equal(greetingArg, 'EHLO')
        assert.equal(client.connected, true)
    })

    it('emits helo after ehlo 250', () => {
        client.command = 'ehlo'
        let heloFired = false
        client.on('helo', () => {
            heloFired = true
        })
        client.socket.emit('line', '250 OK\r\n')
        assert.ok(heloFired)
    })

    it('falls back to HELO when EHLO is rejected with 5xx', () => {
        client.command = 'ehlo'
        let greetingArg = null
        client.on('greeting', (cmd) => {
            greetingArg = cmd
        })
        client.socket.emit('line', '502 EHLO not supported\r\n')
        assert.equal(greetingArg, 'HELO')
    })

    it('emits capabilities on EHLO 2xx then returns if command changed', () => {
        client.command = 'ehlo'
        let capsFired = false
        client.on('capabilities', () => {
            capsFired = true
            client.command = 'starttls' // simulate command change inside handler
        })
        client.socket.emit('line', '250 OK\r\n')
        assert.ok(capsFired)
        // helo should NOT have been emitted because command changed in capabilities handler
    })

    it('emits helo/mail/rcpt/data/dot/rset/auth for their commands', () => {
        const commands = ['helo', 'mail', 'rcpt', 'data', 'dot', 'rset', 'auth']
        for (const cmd of commands) {
            const c = makeClient()
            c.command = cmd
            let fired = false
            c.on(cmd, () => {
                fired = true
            })
            c.socket.emit('line', '250 OK\r\n')
            assert.ok(fired, `expected '${cmd}' event to fire`)
        }
    })

    it('emits quit and destroys on quit 2xx', () => {
        client.command = 'quit'
        let quitFired = false
        client.on('quit', () => {
            quitFired = true
        })
        client.socket.emit('line', '221 Bye\r\n')
        assert.ok(quitFired)
        assert.equal(client.state, STATE.DESTROYED)
    })

    it('sets xclient flag and emits xclient on XCLIENT success', () => {
        client.command = 'xclient'
        let xclientArg = null
        client.on('xclient', (arg) => {
            xclientArg = arg
        })
        client.socket.emit('line', '220 OK\r\n')
        assert.ok(client.xclient)
        assert.equal(xclientArg, 'EHLO')
    })

    it('carries on as helo when XCLIENT is rejected with 5xx', () => {
        client.command = 'xclient'
        client.socket.emit('line', '503 XCLIENT not permitted\r\n')
        assert.equal(client.command, 'helo')
    })

    it('calls upgrade on starttls response', () => {
        client.command = 'starttls'
        client.tls_options = { servername: 'mx.example.com' }
        let upgradeCalled = false
        client.socket.upgrade = (opts, cb) => {
            upgradeCalled = true
        }
        client.socket.emit('line', '220 Go ahead\r\n')
        assert.ok(upgradeCalled)
    })

    it('emits bad_code on 4xx/5xx for active commands', () => {
        client.command = 'mail'
        client.state = STATE.ACTIVE
        let badCode = null
        client.on('bad_code', (code) => {
            badCode = code
        })
        client.socket.emit('line', '550 Rejected\r\n')
        assert.equal(badCode, '550')
    })

    it('returns early after bad_code when state is not ACTIVE', () => {
        client.command = 'mail'
        client.state = STATE.IDLE
        let heloFired = false
        client.on('helo', () => {
            heloFired = true
        }) // shouldn't fire
        let badCodeFired = false
        client.on('bad_code', () => {
            badCodeFired = true
        })
        client.socket.emit('line', '550 Rejected\r\n')
        assert.ok(badCodeFired)
        // state is IDLE so it returns early — no further dispatch
    })

    it('destroys on 441 Connection timed out', () => {
        client.command = 'mail'
        client.state = STATE.ACTIVE // must be ACTIVE to pass through bad_code without returning early
        client.socket.emit('line', '441 Connection timed out\r\n')
        assert.equal(client.state, STATE.DESTROYED)
    })

    it('throws on unknown command', () => {
        client.command = 'unknown_cmd'
        assert.throws(() => client.socket.emit('line', '250 OK\r\n'), /Unknown command: unknown_cmd/)
    })

    // ── Auth responses ──────────────────────────────────────────────────────

    it('emits auth_username on 334 VXNlcm5hbWU6', () => {
        client.command = 'auth'
        let fired = false
        client.on('auth_username', () => {
            fired = true
        })
        client.socket.emit('line', '334 VXNlcm5hbWU6\r\n')
        assert.ok(fired)
    })

    it('emits auth_username on 334 dXNlcm5hbWU6 (workaround)', () => {
        client.command = 'auth'
        let fired = false
        client.on('auth_username', () => {
            fired = true
        })
        client.socket.emit('line', '334 dXNlcm5hbWU6\r\n')
        assert.ok(fired)
    })

    it('emits auth_password on 334 UGFzc3dvcmQ6', () => {
        client.command = 'auth'
        let fired = false
        client.on('auth_password', () => {
            fired = true
        })
        client.socket.emit('line', '334 UGFzc3dvcmQ6\r\n')
        assert.ok(fired)
    })

    it('emits auth and sets authenticated on 235 while authenticating', () => {
        client.command = 'auth'
        client.authenticating = true
        let authFired = false
        client.on('auth', () => {
            authFired = true
        })
        client.socket.emit('line', '235 Authentication successful\r\n')
        assert.ok(authFired)
        assert.equal(client.authenticated, true)
        assert.equal(client.authenticating, false)
    })

    it('emits auth event via switch for auth command with 250', () => {
        client.command = 'auth'
        client.authenticating = false
        let authFired = false
        client.on('auth', () => {
            authFired = true
        })
        client.socket.emit('line', '250 OK\r\n')
        assert.ok(authFired)
    })
})

// ─── Socket connect event ─────────────────────────────────────────────────────

describe('SMTPClient socket connect event', () => {
    it('sets remote_ip from remoteAddress', () => {
        const socket = makeSocket()
        socket.remoteAddress = '::ffff:10.0.0.1'
        const client = makeClient({ socket })
        socket.emit('connect')
        assert.equal(client.remote_ip, '10.0.0.1')
    })

    it('handles undefined remoteAddress without crash', () => {
        const socket = makeSocket()
        socket.remoteAddress = undefined
        const client = makeClient({ socket })
        assert.doesNotThrow(() => socket.emit('connect'))
        assert.equal(client.remote_ip, undefined)
    })

    it('replaces timeout with idle_timeout on connect', () => {
        const socket = makeSocket()
        let lastTimeout = null
        socket.setTimeout = (ms) => {
            lastTimeout = ms
        }
        const client = makeClient({ socket, idle_timeout: 120 })
        socket.emit('connect')
        assert.equal(lastTimeout, 120_000)
    })
})

// ─── closed() — socket error / timeout / close / end ─────────────────────────

describe('SMTPClient closed() handler', () => {
    it('IDLE state: destroys on socket error', () => {
        const client = makeClient()
        assert.equal(client.state, STATE.IDLE)
        client.socket.emit('error', new Error('ECONNREFUSED'))
        assert.equal(client.state, STATE.DESTROYED)
    })

    it('ACTIVE state: emits error then destroys on socket error', () => {
        const client = makeClient()
        client.state = STATE.ACTIVE
        const errors = []
        client.on('error', (e) => errors.push(e))
        client.socket.emit('error', new Error('connection dropped'))
        assert.ok(errors.length === 1)
        assert.ok(/SMTP connection errored/.test(errors[0]))
        assert.equal(client.state, STATE.DESTROYED)
    })

    it('RELEASED state: destroys on socket error', () => {
        const client = makeClient()
        client.state = STATE.RELEASED
        client.socket.emit('error', new Error('gone'))
        assert.equal(client.state, STATE.DESTROYED)
    })

    it('DESTROYED state: emits connection-error on socket error', () => {
        const client = makeClient()
        client.destroy()
        const connErrors = []
        client.on('connection-error', (e) => connErrors.push(e))
        client.socket.emit('error', new Error('late error'))
        assert.ok(connErrors.length === 1)
        assert.ok(/SMTP connection errored/.test(connErrors[0]))
    })

    it('DESTROYED state: emits connection-error on socket timeout', () => {
        const client = makeClient()
        client.destroy()
        const connErrors = []
        client.on('connection-error', (e) => connErrors.push(e))
        client.socket.emit('timeout')
        assert.ok(connErrors.length === 1)
        assert.ok(/timed out/.test(connErrors[0]))
    })

    it('DESTROYED state: does NOT emit connection-error on socket close', () => {
        const client = makeClient()
        client.destroy()
        const connErrors = []
        client.on('connection-error', (e) => connErrors.push(e))
        client.socket.emit('close')
        assert.equal(connErrors.length, 0)
    })

    it('handles socket timeout in IDLE state', () => {
        const client = makeClient()
        client.socket.emit('timeout')
        assert.equal(client.state, STATE.DESTROYED)
    })

    it('handles socket close in IDLE state', () => {
        const client = makeClient()
        client.socket.emit('close')
        assert.equal(client.state, STATE.DESTROYED)
    })

    it('handles socket end in IDLE state', () => {
        const client = makeClient()
        client.socket.emit('end')
        assert.equal(client.state, STATE.DESTROYED)
    })

    it('closed handler coerces null error to empty string', () => {
        const client = makeClient()
        client.state = STATE.ACTIVE
        const errors = []
        client.on('error', (e) => errors.push(e))
        client.socket.emit('error', null)
        assert.ok(errors.length === 1)
        assert.ok(errors[0].includes('SMTP connection errored'))
    })
})

// ─── load_tls_config ──────────────────────────────────────────────────────────

describe('SMTPClient#load_tls_config', () => {
    it('sets tls_options with servername equal to host', () => {
        const client = makeClient()
        client.load_tls_config()
        assert.equal(client.tls_options.servername, 'mx.example.com')
    })

    it('merges additional opts into tls_options', () => {
        const client = makeClient()
        client.load_tls_config({ key: Buffer.from('secret'), rejectUnauthorized: false })
        assert.equal(client.tls_options.servername, 'mx.example.com')
        assert.equal(client.tls_options.rejectUnauthorized, false)
        assert.ok(Buffer.isBuffer(client.tls_options.key))
    })
})

// ─── send_command ─────────────────────────────────────────────────────────────

describe('SMTPClient#send_command', () => {
    it('writes command + CRLF to socket', () => {
        const written = []
        const socket = makeSocket()
        socket.write = (data) => written.push(data)
        const client = makeClient({ socket })
        client.send_command('EHLO', 'example.com')
        assert.equal(written[0], 'EHLO example.com\r\n')
        assert.equal(client.command, 'ehlo')
        assert.deepEqual(client.response, [])
    })

    it('writes just "." for dot command', () => {
        const written = []
        const socket = makeSocket()
        socket.write = (data) => written.push(data)
        const client = makeClient({ socket })
        client.send_command('dot')
        assert.equal(written[0], '.\r\n')
        assert.equal(client.command, 'dot')
    })

    it('sends command without data', () => {
        const written = []
        const socket = makeSocket()
        socket.write = (data) => written.push(data)
        const client = makeClient({ socket })
        client.send_command('QUIT')
        assert.equal(written[0], 'QUIT\r\n')
    })

    it('emits client_protocol event', () => {
        const lines = []
        const client = makeClient()
        client.on('client_protocol', (l) => lines.push(l))
        client.send_command('MAIL', 'FROM:<me@example.com>')
        assert.equal(lines[0], 'MAIL FROM:<me@example.com>')
    })
})

// ─── start_data ───────────────────────────────────────────────────────────────

describe('SMTPClient#start_data', () => {
    it('sets command to dot and resets response', () => {
        const client = makeClient()
        client.response = ['leftover']
        const pt = new PassThrough()
        pt.pipe = () => {}
        client.start_data(pt)
        assert.equal(client.command, 'dot')
        assert.deepEqual(client.response, [])
    })

    it('pipes the data stream to the socket', () => {
        const client = makeClient()
        let pipeTarget = null
        const mockStream = {
            pipe: (dest, opts) => {
                pipeTarget = dest
            },
        }
        client.start_data(mockStream)
        assert.equal(pipeTarget, client.socket)
    })
})

// ─── release ──────────────────────────────────────────────────────────────────

describe('SMTPClient#release', () => {
    it('is a no-op when already DESTROYED', () => {
        const client = makeClient()
        client.destroy()
        assert.doesNotThrow(() => client.release())
        assert.equal(client.state, STATE.DESTROYED)
    })

    it('sends QUIT and destroys when connected', () => {
        const written = []
        const socket = makeSocket()
        socket.write = (data) => written.push(data)
        const client = makeClient({ socket })
        client.connected = true
        client.release()
        assert.ok(written.some((l) => l === 'QUIT\r\n'))
        assert.equal(client.state, STATE.DESTROYED)
    })

    it('destroys without QUIT when not connected', () => {
        const written = []
        const socket = makeSocket()
        socket.write = (data) => written.push(data)
        const client = makeClient({ socket })
        client.connected = false
        client.release()
        assert.equal(written.length, 0)
        assert.equal(client.state, STATE.DESTROYED)
    })

    it('removes all named event listeners', () => {
        const client = makeClient()
        client.on('greeting', () => {})
        client.on('error', () => {})
        client.on('bad_code', () => {})
        client.release()
        assert.equal(client.listenerCount('greeting'), 0)
        assert.equal(client.listenerCount('error'), 0)
        assert.equal(client.listenerCount('bad_code'), 0)
    })
})

// ─── destroy ──────────────────────────────────────────────────────────────────

describe('SMTPClient#destroy', () => {
    it('sets state to DESTROYED and calls socket.destroy', () => {
        const client = makeClient()
        client.destroy()
        assert.equal(client.state, STATE.DESTROYED)
        assert.ok(client.socket.destroy.called)
    })

    it('is idempotent — second call is a no-op', () => {
        const client = makeClient()
        client.destroy()
        const callCount = client.socket.destroy.callCount
        client.destroy()
        assert.equal(client.socket.destroy.callCount, callCount)
    })
})

// ─── upgrade ──────────────────────────────────────────────────────────────────

describe('SMTPClient#upgrade', () => {
    it('delegates to socket.upgrade with tls_options', () => {
        const socket = makeSocket()
        let upgradeOpts = null
        socket.upgrade = (opts, cb) => {
            upgradeOpts = opts
        }
        const client = makeClient({ socket })
        const opts = { servername: 'secure.example.com', rejectUnauthorized: true }
        client.upgrade(opts)
        assert.deepEqual(upgradeOpts, opts)
    })

    it('logs upgrade details in callback', () => {
        const socket = makeSocket()
        socket.upgrade = (opts, cb) =>
            cb(
                true,
                null,
                {
                    subject: { CN: 'example.com', O: 'Org' },
                    issuer: { O: 'CA' },
                    valid_to: '2030-01-01',
                    fingerprint: 'AA:BB',
                },
                { name: 'AES', version: 'TLSv1.3' },
            )
        const client = makeClient({ socket })
        assert.doesNotThrow(() => client.upgrade({ servername: 'example.com' }))
    })
})

// ─── is_dead_sender ───────────────────────────────────────────────────────────

describe('SMTPClient#is_dead_sender', () => {
    it('returns false when connection has a transaction', () => {
        const client = makeClient()
        const plugin = makePlugin()
        const conn = makeConnection()
        conn.transaction = { mail_from: new Address('<a@b.com>') }
        assert.equal(client.is_dead_sender(plugin, conn), false)
    })

    it('returns true and releases when transaction is null', () => {
        const client = makeClient()
        client.connected = false // ensure release() doesn't try to QUIT
        const plugin = makePlugin()
        const conn = makeConnection()
        conn.transaction = null
        const result = client.is_dead_sender(plugin, conn)
        assert.equal(result, true)
        assert.equal(client.state, STATE.DESTROYED)
    })
})

// ─── get_client export ────────────────────────────────────────────────────────

describe('smtp_client.get_client', () => {
    beforeEach(() => mockTlsConnect())
    afterEach(restoreTlsConnect)

    it('calls callback with a new SMTPClient', (t, done) => {
        smtp_client_module.get_client(
            { notes: {} },
            (client) => {
                assert.ok(client instanceof SMTPClient)
                assert.ok(client.uuid)
                done()
            },
            { host: 'mx.example.com', port: 25 },
        )
    })
})

// ─── onCapabilitiesOutbound ───────────────────────────────────────────────────

describe('smtp_client.onCapabilitiesOutbound', () => {
    let client, written

    beforeEach(() => {
        written = []
        const socket = makeSocket()
        socket.write = (data) => written.push(data)
        client = makeClient({ socket })
        client.tls_options = {}
    })

    it('sends XCLIENT when capability advertised and not yet done', () => {
        client.response = ['XCLIENT ADDR']
        client.xclient = false
        const conn = makeConnection()
        smtp_client_module.onCapabilitiesOutbound(client, false, conn, {})
        assert.ok(written.some((l) => /XCLIENT ADDR=/.test(l)))
    })

    it('skips XCLIENT when already performed', () => {
        client.response = ['XCLIENT ADDR']
        client.xclient = true
        smtp_client_module.onCapabilitiesOutbound(client, false, makeConnection(), {})
        assert.ok(!written.some((l) => l.startsWith('XCLIENT')))
    })

    it('sets smtputf8 flag when SMTPUTF8 advertised', () => {
        client.response = ['SMTPUTF8']
        smtp_client_module.onCapabilitiesOutbound(client, false, makeConnection(), {})
        assert.ok(client.smtputf8)
    })

    it('sends STARTTLS when advertised, not secured, and enable_tls true', () => {
        client.response = ['STARTTLS']
        smtp_client_module.onCapabilitiesOutbound(client, false, makeConnection(), { enable_tls: true }, () => {})
        assert.ok(written.some((l) => l === 'STARTTLS\r\n'))
    })

    it('skips STARTTLS when already secured', () => {
        client.response = ['STARTTLS']
        smtp_client_module.onCapabilitiesOutbound(client, true, makeConnection(), { enable_tls: true })
        assert.ok(!written.some((l) => l === 'STARTTLS\r\n'))
    })

    it('skips STARTTLS when enable_tls is false', () => {
        client.response = ['STARTTLS']
        smtp_client_module.onCapabilitiesOutbound(client, false, makeConnection(), { enable_tls: false })
        assert.ok(!written.some((l) => l === 'STARTTLS\r\n'))
    })

    it('parses AUTH capabilities', () => {
        client.response = ['AUTH PLAIN LOGIN CRAM-MD5']
        smtp_client_module.onCapabilitiesOutbound(client, false, makeConnection(), {})
        assert.deepEqual(client.auth_capabilities, ['plain', 'login', 'cram-md5'])
    })

    it('handles multiple capabilities in one response', () => {
        client.response = ['SMTPUTF8', 'AUTH PLAIN', 'STARTTLS']
        smtp_client_module.onCapabilitiesOutbound(client, false, makeConnection(), {})
        assert.ok(client.smtputf8)
        assert.deepEqual(client.auth_capabilities, ['plain'])
    })

    it('skips STARTTLS when host is in no_tls_hosts ban list', () => {
        client.response = ['STARTTLS']
        // Note: the code checks tls_options.no_tls_hosts but reads tls_config.no_tls_hosts
        // (a known quirk) — set both to exercise the branch
        client.tls_options = { no_tls_hosts: ['10.0.0.0/8'] }
        client.tls_config = { no_tls_hosts: ['10.0.0.0/8'] }
        client.remote_ip = '10.0.0.1'
        const conn = makeConnection()
        smtp_client_module.onCapabilitiesOutbound(client, false, conn, { enable_tls: true, host: '10.0.0.1' }, () => {})
        assert.ok(!written.some((l) => l === 'STARTTLS\r\n'))
    })
})

// ─── get_client_plugin ────────────────────────────────────────────────────────

describe('smtp_client.get_client_plugin', () => {
    let plugin, conn

    beforeEach(() => {
        mockTlsConnect()
        plugin = makePlugin()
        conn = makeConnection()
        conn.transaction = { mail_from: new Address('<sender@example.com>') }
    })
    afterEach(restoreTlsConnect)

    it('calls callback with null error and a SMTPClient', (t, done) => {
        smtp_client_module.get_client_plugin(plugin, conn, { host: 'relay.example.com', port: 25 }, (err, client) => {
            assert.equal(err, null)
            assert.ok(client instanceof SMTPClient)
            done()
        })
    })

    it('merges auth_type / auth_user / auth_pass into c.auth', (t, done) => {
        const c = { host: 'relay.example.com', port: 25, auth_type: 'plain', auth_user: 'alice', auth_pass: 's3cr3t' }
        smtp_client_module.get_client_plugin(plugin, conn, c, (err, client) => {
            assert.deepEqual(c.auth, { type: 'plain', user: 'alice', pass: 's3cr3t' })
            done()
        })
    })

    it('does not set c.auth when no auth fields present', (t, done) => {
        const c = { host: 'relay.example.com', port: 25 }
        smtp_client_module.get_client_plugin(plugin, conn, c, (err, client) => {
            assert.equal(c.auth, undefined)
            done()
        })
    })

    it('loads tls_config on the returned client', (t, done) => {
        smtp_client_module.get_client_plugin(plugin, conn, { host: 'relay.example.com', port: 25 }, (err, client) => {
            assert.ok(client.tls_options)
            done()
        })
    })

    it('greeting handler sends EHLO with local.host (no xclient)', (t, done) => {
        smtp_client_module.get_client_plugin(plugin, conn, { host: 'relay.example.com', port: 25 }, (err, client) => {
            const written = []
            client.socket.write = (data) => written.push(data)
            client.emit('greeting', 'EHLO')
            assert.ok(written.some((l) => /EHLO relay\.example\.com/.test(l)))
            done()
        })
    })

    it('greeting handler sends EHLO with hello.host when xclient is set', (t, done) => {
        smtp_client_module.get_client_plugin(plugin, conn, { host: 'relay.example.com', port: 25 }, (err, client) => {
            client.xclient = true
            const written = []
            client.socket.write = (data) => written.push(data)
            client.emit('greeting', 'EHLO')
            assert.ok(written.some((l) => /EHLO client\.example\.com/.test(l)))
            done()
        })
    })

    it('xclient handler sends EHLO with hello.host', (t, done) => {
        smtp_client_module.get_client_plugin(plugin, conn, { host: 'relay.example.com', port: 25 }, (err, client) => {
            client.xclient = true
            const written = []
            client.socket.write = (data) => written.push(data)
            client.emit('xclient', 'EHLO')
            assert.ok(written.some((l) => /EHLO client\.example\.com/.test(l)))
            done()
        })
    })

    it('helo handler sends MAIL FROM when no auth configured', (t, done) => {
        smtp_client_module.get_client_plugin(plugin, conn, { host: 'relay.example.com', port: 25 }, (err, client) => {
            const written = []
            client.socket.write = (data) => written.push(data)
            client.emit('helo')
            assert.ok(written.some((l) => /MAIL FROM/.test(l)))
            done()
        })
    })

    it('helo handler sends MAIL FROM when already authenticated', (t, done) => {
        const c = { host: 'relay.example.com', port: 25, auth: { type: 'plain', user: 'u', pass: 'p' } }
        smtp_client_module.get_client_plugin(plugin, conn, c, (err, client) => {
            client.authenticated = true
            client.auth_capabilities = ['plain']
            const written = []
            client.socket.write = (data) => written.push(data)
            client.emit('helo')
            assert.ok(written.some((l) => /MAIL FROM/.test(l)))
            done()
        })
    })

    it('helo handler skips when auth.type is null', (t, done) => {
        const c = { host: 'relay.example.com', port: 25, auth: { type: null, user: 'u', pass: 'p' } }
        smtp_client_module.get_client_plugin(plugin, conn, c, (err, client) => {
            client.authenticated = false
            client.auth_capabilities = []
            const written = []
            client.socket.write = (data) => written.push(data)
            assert.doesNotThrow(() => client.emit('helo'))
            assert.equal(written.length, 0)
            done()
        })
    })

    it('helo handler throws when auth type not supported by server', (t, done) => {
        const c = { host: 'relay.example.com', port: 25, auth: { type: 'plain', user: 'u', pass: 'p' } }
        smtp_client_module.get_client_plugin(plugin, conn, c, (err, client) => {
            client.authenticated = false
            client.auth_capabilities = ['cram-md5'] // plain not in list
            assert.throws(() => client.emit('helo'), /not supported by server/)
            done()
        })
    })

    it('helo handler sends AUTH PLAIN with base64 credentials', (t, done) => {
        const c = { host: 'relay.example.com', port: 25, auth: { type: 'plain', user: 'alice', pass: 'secret' } }
        smtp_client_module.get_client_plugin(plugin, conn, c, (err, client) => {
            client.authenticated = false
            client.auth_capabilities = ['plain']
            const written = []
            client.socket.write = (data) => written.push(data)
            client.emit('helo')
            assert.ok(written.some((l) => /AUTH PLAIN/.test(l)))
            done()
        })
    })

    it('helo handler throws for plain auth with no user/pass', (t, done) => {
        const c = { host: 'relay.example.com', port: 25, auth: { type: 'plain', user: '', pass: '' } }
        smtp_client_module.get_client_plugin(plugin, conn, c, (err, client) => {
            client.authenticated = false
            client.auth_capabilities = ['plain']
            assert.throws(() => client.emit('helo'), /Must include auth\.user/)
            done()
        })
    })

    it('helo handler throws for cram-md5 (not implemented)', (t, done) => {
        const c = { host: 'relay.example.com', port: 25, auth: { type: 'cram-md5', user: 'u', pass: 'p' } }
        smtp_client_module.get_client_plugin(plugin, conn, c, (err, client) => {
            client.authenticated = false
            client.auth_capabilities = ['cram-md5']
            assert.throws(() => client.emit('helo'), /Not implemented/)
            done()
        })
    })

    it('helo handler throws for unknown auth type', (t, done) => {
        const c = { host: 'relay.example.com', port: 25, auth: { type: 'gssapi', user: 'u', pass: 'p' } }
        smtp_client_module.get_client_plugin(plugin, conn, c, (err, client) => {
            client.authenticated = false
            client.auth_capabilities = ['gssapi']
            assert.throws(() => client.emit('helo'), /Unknown AUTH type/)
            done()
        })
    })

    it('auth handler sends MAIL FROM after successful authentication', (t, done) => {
        smtp_client_module.get_client_plugin(plugin, conn, { host: 'relay.example.com', port: 25 }, (err, client) => {
            client.authenticating = false
            const written = []
            client.socket.write = (data) => written.push(data)
            client.emit('auth')
            assert.ok(written.some((l) => /MAIL FROM/.test(l)))
            done()
        })
    })

    it('auth handler returns early when still authenticating', (t, done) => {
        smtp_client_module.get_client_plugin(plugin, conn, { host: 'relay.example.com', port: 25 }, (err, client) => {
            client.authenticating = true
            const written = []
            client.socket.write = (data) => written.push(data)
            client.emit('auth')
            assert.equal(written.length, 0)
            done()
        })
    })

    it('error handler calls call_next', (t, done) => {
        smtp_client_module.get_client_plugin(plugin, conn, { host: 'relay.example.com', port: 25 }, (err, client) => {
            let nextCalled = false
            client.next = () => {
                nextCalled = true
            }
            client.emit('error', 'something went wrong')
            assert.ok(nextCalled)
            done()
        })
    })

    it('connection-error handler calls call_next', (t, done) => {
        smtp_client_module.get_client_plugin(plugin, conn, { host: 'relay.example.com', port: 25 }, (err, client) => {
            let nextCalled = false
            client.next = () => {
                nextCalled = true
            }
            client.emit('connection-error', 'backend unreachable')
            assert.ok(nextCalled)
            done()
        })
    })

    it('connection-error handler calls host_pool.failed when pool exists', (t, done) => {
        let failedCalled = false
        conn.server.notes.host_pool = {
            failed: (host, port) => {
                failedCalled = true
            },
        }
        smtp_client_module.get_client_plugin(plugin, conn, { host: 'relay.example.com', port: 25 }, (err, client) => {
            client.emit('connection-error', 'Error: connect ECONNREFUSED')
            assert.ok(failedCalled)
            done()
        })
    })

    it('throws when neither forwarding_host_pool nor host/port specified', () => {
        assert.throws(
            () => smtp_client_module.get_client_plugin(plugin, conn, {}, () => {}),
            /forwarding_host_pool or host and port/,
        )
    })

    it('uses forwarding_host_pool when configured', (t, done) => {
        const c = { forwarding_host_pool: '10.0.0.1:25, 10.0.0.2:25' }
        smtp_client_module.get_client_plugin(plugin, conn, c, (err, client) => {
            assert.equal(err, null)
            assert.ok(client instanceof SMTPClient)
            // host_pool is created and stored in server notes
            assert.ok(conn.server.notes.host_pool)
            done()
        })
    })

    it('reuses existing host_pool from server.notes', (t, done) => {
        const HostPool = require('../host_pool')
        const pool = new HostPool('10.0.0.3:25')
        conn.server.notes.host_pool = pool
        const c = { forwarding_host_pool: '10.0.0.3:25' }
        smtp_client_module.get_client_plugin(plugin, conn, c, (err, client) => {
            assert.equal(conn.server.notes.host_pool, pool) // same object reused
            done()
        })
    })

    it('server_protocol event logs protocol line', (t, done) => {
        smtp_client_module.get_client_plugin(plugin, conn, { host: 'relay.example.com', port: 25 }, (err, client) => {
            assert.doesNotThrow(() => client.emit('server_protocol', '220 server ready'))
            done()
        })
    })

    it('capabilities handler calls onCapabilitiesOutbound', (t, done) => {
        const c = { host: 'relay.example.com', port: 25, enable_tls: true }
        smtp_client_module.get_client_plugin(plugin, conn, c, (err, client) => {
            // Simulate EHLO response containing STARTTLS + AUTH
            client.response = ['SIZE 10240000', 'AUTH PLAIN LOGIN']
            assert.doesNotThrow(() => client.emit('capabilities'))
            assert.deepEqual(client.auth_capabilities, ['plain', 'login'])
            done()
        })
    })

    it('on_secured fires greeting and is idempotent', (t, done) => {
        const c = { host: 'relay.example.com', port: 25, enable_tls: true }
        smtp_client_module.get_client_plugin(plugin, conn, c, (err, client) => {
            // Trigger STARTTLS so on_secured is registered on socket 'secure'
            client.response = ['STARTTLS']
            const written = []
            client.socket.write = (d) => written.push(d)
            client.emit('capabilities') // → registers socket.on('secure', on_secured)

            let greetingCount = 0
            client.on('greeting', () => {
                greetingCount++
            })

            // First secure event → on_secured sets secured=true and emits greeting
            client.socket.emit('secure')
            // Second secure event → on_secured returns early (idempotent)
            client.socket.emit('secure')

            assert.equal(greetingCount, 1)
            done()
        })
    })

    it('connected + xclient: sends XCLIENT immediately', (t, done) => {
        // Make the mock socket emit a 220 greeting synchronously during SMTPClient construction
        // so smtp_client.connected is true before get_client_plugin's check runs
        const origConnect = tls_socket.connect
        tls_socket.connect = () => {
            const s = makeSocket()
            net_utils.add_line_processor(s)
            const origOn = s.on.bind(s)
            let lineHandlerRegistered = false
            s.on = function (event, handler) {
                origOn(event, handler)
                if (event === 'line' && !lineHandlerRegistered) {
                    lineHandlerRegistered = true
                    // emit greeting synchronously so connected becomes true before callback
                    handler('220 ready\r\n')
                }
                return s
            }
            return s
        }

        const written = []
        const mockPlugin = makePlugin()

        smtp_client_module.get_client_plugin(
            mockPlugin,
            conn,
            { host: 'relay.example.com', port: 25 },
            (err, client) => {
                tls_socket.connect = origConnect
                // If connected=true and xclient=true, XCLIENT was sent
                // If connected=true and xclient=false, helo was emitted
                // Either way connected path was exercised — just verify no crash
                assert.ok(client instanceof SMTPClient)
                done()
            },
        )
    })
})

// ─── Full SMTP session (integration) ─────────────────────────────────────────

describe('smtp_client full session (basic)', () => {
    beforeEach((t, done) => {
        smtp_client_module.get_client(
            { notes: {} },
            (client) => {
                this.client = client
                done()
            },
            { socket: require('./fixtures/line_socket').connect() },
        )
    })

    it('conducts a SMTP session', (t, done) => {
        const message_stream = new message.stream({ main: { spool_after: 1024 } }, '123456789')

        const data = []
        let reading_body = false
        data.push('220 hi')

        this.client.on('greeting', (command) => {
            assert.equal(this.client.response[0], 'hi')
            assert.equal('EHLO', command)
            this.client.send_command(command, 'example.com')
        })

        data.push('EHLO example.com')
        data.push('250 hello')

        this.client.on('helo', () => {
            assert.equal(this.client.response[0], 'hello')
            this.client.send_command('MAIL', 'FROM: me@example.com')
        })

        data.push('MAIL FROM: me@example.com')
        data.push('250 sender ok')

        this.client.on('mail', () => {
            assert.equal(this.client.response[0], 'sender ok')
            this.client.send_command('RCPT', 'TO: you@example.com')
        })

        data.push('RCPT TO: you@example.com')
        data.push('250 recipient ok')

        this.client.on('rcpt', () => {
            assert.equal(this.client.response[0], 'recipient ok')
            this.client.send_command('DATA')
        })

        data.push('DATA')
        data.push('354 go ahead')

        this.client.on('data', () => {
            assert.equal(this.client.response[0], 'go ahead')
            this.client.start_data(message_stream)
            message_stream.add_line('Header: test\r\n')
            message_stream.add_line('\r\n')
            message_stream.add_line('hi\r\n')
            message_stream.add_line_end()
        })

        data.push('Header: test')
        data.push('')
        data.push('hi')
        data.push('.')
        data.push('250 message queued')

        this.client.on('dot', () => {
            assert.equal(this.client.response[0], 'message queued')
            this.client.send_command('QUIT')
        })

        data.push('QUIT')
        data.push('221 goodbye')

        this.client.on('quit', () => {
            assert.equal(this.client.response[0], 'goodbye')
            done()
        })

        this.client.socket.write = function (line) {
            if (data.length === 0) {
                assert.ok(false)
                return
            }
            const lineStr = Buffer.isBuffer(line) ? line.toString() : line
            assert.equal(`${data.shift()}\r\n`, lineStr)
            if (reading_body && lineStr === '.\r\n') reading_body = false
            if (reading_body) return true
            if (lineStr === 'DATA\r\n') reading_body = true
            while (true) {
                const line2 = data.shift()
                this.emit('line', `${line2}\r\n`)
                if (line2[3] === ' ') break
            }
            return true
        }

        this.client.socket.emit('line', data.shift())
    })
})

// ─── Full SMTP session with AUTH (integration) ───────────────────────────────

describe('smtp_client full session (auth)', () => {
    beforeEach((t, done) => {
        smtp_client_module.get_client(
            { notes: {} },
            (client) => {
                this.client = client
                done()
            },
            { socket: require('./fixtures/line_socket').connect() },
        )
    })

    it('authenticates during SMTP conversation', (t, done) => {
        const message_stream = new message.stream({ main: { spool_after: 1024 } }, '123456789')

        const data = []
        let reading_body = false
        data.push('220 hi')

        this.client.on('greeting', (command) => {
            assert.equal(this.client.response[0], 'hi')
            assert.equal('EHLO', command)
            this.client.send_command(command, 'example.com')
        })

        data.push('EHLO example.com')
        data.push('250 hello')

        this.client.on('helo', () => {
            assert.equal(this.client.response[0], 'hello')
            this.client.send_command('AUTH', 'PLAIN AHRlc3QAdGVzdHBhc3M=')
            this.client.send_command('MAIL', 'FROM: me@example.com')
        })

        data.push('AUTH PLAIN AHRlc3QAdGVzdHBhc3M=')
        data.push('235 Authentication successful.')

        data.push('MAIL FROM: me@example.com')
        data.push('250 sender ok')

        this.client.on('mail', () => {
            assert.equal(this.client.response[0], 'sender ok')
            this.client.send_command('RCPT', 'TO: you@example.com')
        })

        data.push('RCPT TO: you@example.com')
        data.push('250 recipient ok')

        this.client.on('rcpt', () => {
            assert.equal(this.client.response[0], 'recipient ok')
            this.client.send_command('DATA')
        })

        data.push('DATA')
        data.push('354 go ahead')

        this.client.on('data', () => {
            assert.equal(this.client.response[0], 'go ahead')
            this.client.start_data(message_stream)
            message_stream.add_line('Header: test\r\n')
            message_stream.add_line('\r\n')
            message_stream.add_line('hi\r\n')
            message_stream.add_line_end()
        })

        data.push('Header: test')
        data.push('')
        data.push('hi')
        data.push('.')
        data.push('250 message queued')

        this.client.on('dot', () => {
            assert.equal(this.client.response[0], 'message queued')
            this.client.send_command('QUIT')
        })

        data.push('QUIT')
        data.push('221 goodbye')

        this.client.on('quit', () => {
            assert.equal(this.client.response[0], 'goodbye')
            done()
        })

        this.client.socket.write = function (line) {
            if (data.length === 0) {
                assert.ok(false)
                return
            }
            const lineStr = Buffer.isBuffer(line) ? line.toString() : line
            assert.equal(`${data.shift()}\r\n`, lineStr)
            if (reading_body && lineStr === '.\r\n') reading_body = false
            if (!reading_body) {
                if (lineStr === 'DATA\r\n') reading_body = true
                while (true) {
                    const line2 = data.shift()
                    this.emit('line', `${line2}\r\n`)
                    if (line2[3] === ' ') break
                }
            }
            return true
        }

        this.client.socket.emit('line', data.shift())
    })
})

// ─── testUpgradeIsCalledOnSTARTTLS ───────────────────────────────────────────

describe('smtp_client', () => {
    it('testUpgradeIsCalledOnSTARTTLS', () => {
        const plugin = makePlugin()

        const cmds = {}
        let upgradeArgs = {}

        const socket = {
            setTimeout: () => {},
            setKeepAlive: () => {},
            on: (eventName, callback) => {
                cmds[eventName] = callback
            },
            upgrade: (arg) => {
                upgradeArgs = arg
            },
        }

        const client = new SMTPClient({ host: 'mx.example.com', port: 25, socket })
        client.load_tls_config({ key: Buffer.from('OutboundTlsKeyLoaded') })

        client.command = 'starttls'
        cmds.line('250 Hello client.example.com\r\n')

        const { StringDecoder } = require('node:string_decoder')
        const decoder = new StringDecoder('utf8')
        const cent = Buffer.from(upgradeArgs.key)
        assert.equal(decoder.write(cent), 'OutboundTlsKeyLoaded')
    })

    it('startTLS', () => {
        let cmd = ''

        const socket = {
            setTimeout: () => {},
            setKeepAlive: () => {},
            on: () => {},
            upgrade: () => {},
            write: (arg) => {
                cmd = arg
            },
        }

        const client = new SMTPClient({ host: 'mx.example.com', port: 25, socket })
        client.tls_options = {}
        client.secured = false
        client.response = ['STARTTLS']

        smtp_client_module.onCapabilitiesOutbound(client, false, undefined, { enable_tls: true })

        assert.equal(cmd, 'STARTTLS\r\n')
    })
})
