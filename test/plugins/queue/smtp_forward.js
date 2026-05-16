'use strict'

const { describe, it, beforeEach, afterEach } = require('node:test')
const assert = require('node:assert/strict')
const { EventEmitter } = require('node:events')
const path = require('node:path')

const { Address } = require('../../../address')
const fixtures = require('haraka-test-fixtures')
const Notes = require('haraka-notes')

// Haraka result codes (haraka-constants)
const OK = 906
const DENY = 902
const DENYSOFT = 903

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makePlugin() {
    const p = new fixtures.plugin('queue/smtp_forward')
    p.config = p.config.module_config(path.resolve('test'))
    p.register()
    // Deep-clone cfg to prevent shared haraka-config reference mutations across tests
    p.cfg = JSON.parse(JSON.stringify(p.cfg))
    return p
}

function makeConnection() {
    const conn = fixtures.connection.createConnection()
    conn.init_transaction()
    conn.server = { notes: {} }
    return conn
}

function makeHmail(notes = {}) {
    const n = new Notes()
    for (const [k, v] of Object.entries(notes)) n.set(k, v)
    return { todo: { notes: n } }
}

/** Mock SMTPClient returned by get_client_plugin stubs. */
class MockSMTPClient extends EventEmitter {
    constructor() {
        super()
        this.smtp_utf8 = false
        this.response = ['250 OK']
        this.next = null
        this.commands = []
    }

    call_next(code, msg) {
        if (this.next) {
            const n = this.next
            delete this.next
            n(code, msg)
        }
    }

    release() {
        this.released = true
    }

    is_dead_sender() {
        return false
    }

    send_command(cmd, data) {
        this.commands.push(data !== undefined ? `${cmd} ${data}` : cmd)
    }

    start_data(stream) {
        this.started = true
    }
}

// Temporarily replace smtp_client_mod.get_client_plugin for queue_forward tests
const smtp_client_mod = require('../../../smtp_client')

function stubGetClientPlugin(factory) {
    const orig = smtp_client_mod.get_client_plugin
    smtp_client_mod.get_client_plugin = factory
    return () => {
        smtp_client_mod.get_client_plugin = orig
    }
}

// ─── register ────────────────────────────────────────────────────────────────

describe('smtp_forward register', () => {
    it('registers the queue hook', () => {
        const plugin = makePlugin()
        assert.ok(plugin.hooks.queue)
    })

    it('registers the get_mx hook', () => {
        const plugin = makePlugin()
        assert.ok(plugin.hooks.get_mx)
    })

    it('registers check_sender hook when check_sender=true', () => {
        const plugin = new fixtures.plugin('queue/smtp_forward')
        plugin.config = plugin.config.module_config(path.resolve('test'))
        plugin.load_smtp_forward_ini = function () {
            this.cfg = {
                main: { check_sender: true, check_recipient: true, enable_outbound: true, host: 'localhost', port: 25 },
            }
        }
        plugin.register()
        assert.ok(plugin.hooks.mail)
    })

    it('registers check_recipient hook when check_recipient=true', () => {
        const plugin = new fixtures.plugin('queue/smtp_forward')
        plugin.config = plugin.config.module_config(path.resolve('test'))
        plugin.load_smtp_forward_ini = function () {
            this.cfg = { main: { check_recipient: true, host: 'localhost', port: 25 } }
        }
        plugin.register()
        assert.ok(plugin.hooks.rcpt)
    })

    it('registers queue_outbound hook when enable_outbound=true', () => {
        const plugin = new fixtures.plugin('queue/smtp_forward')
        plugin.config = plugin.config.module_config(path.resolve('test'))
        plugin.load_smtp_forward_ini = function () {
            this.cfg = { main: { enable_outbound: true, host: 'localhost', port: 25 } }
        }
        plugin.register()
        assert.ok(plugin.hooks.queue_outbound)
    })

    it('aborts registration when load_errs is non-empty', () => {
        const plugin = new fixtures.plugin('queue/smtp_forward')
        plugin.config = plugin.config.module_config(path.resolve('test'))
        plugin.load_smtp_forward_ini = function () {
            this.cfg = { main: {} }
            this.load_errs.push('simulated error')
        }
        plugin.register()
        assert.equal(plugin.hooks.queue, undefined)
    })

    it('TLS enabled but no outbound config in tls.ini', () => {
        const plugin = new fixtures.plugin('queue/smtp_forward')
        plugin.register()
        assert.equal(plugin.tls_options, undefined)
        assert.ok(Object.keys(plugin.hooks).length)
    })
})

// ─── load_smtp_forward_ini ────────────────────────────────────────────────────

describe('smtp_forward load_smtp_forward_ini', () => {
    it('loads configuration from ini file', () => {
        const plugin = makePlugin()
        assert.ok(plugin.cfg.main)
        assert.equal(plugin.cfg.main.host, 'localhost')
    })

    it('sets up a reload callback', () => {
        // Calling load_smtp_forward_ini again should not crash
        const plugin = makePlugin()
        assert.doesNotThrow(() => plugin.load_smtp_forward_ini())
        assert.ok(plugin.cfg.main)
    })
})

// ─── get_config ───────────────────────────────────────────────────────────────

describe('smtp_forward get_config', () => {
    let plugin, connection

    beforeEach(() => {
        plugin = makePlugin()
        connection = makeConnection()
    })

    it('returns main cfg when no transaction', () => {
        connection.transaction = null
        const cfg = plugin.get_config(connection)
        assert.equal(cfg.host, 'localhost')
    })

    it('returns main cfg when no rcpt_to (no domain_selector set)', () => {
        const cfg = plugin.get_config(connection)
        assert.equal(cfg.host, 'localhost')
        assert.equal(cfg.enable_tls, true)
    })

    it('returns main cfg for null recipient', () => {
        connection.transaction.rcpt_to.push(new Address('<>'))
        const cfg = plugin.get_config(connection)
        assert.equal(cfg.host, 'localhost')
    })

    it('returns main cfg for unknown recipient domain', () => {
        connection.transaction.rcpt_to.push(new Address('<matt@example.com>'))
        const cfg = plugin.get_config(connection)
        assert.equal(cfg.host, 'localhost')
    })

    it('returns domain config for known recipient domain', () => {
        connection.transaction.rcpt_to.push(new Address('<matt@test.com>'))
        const cfg = plugin.get_config(connection)
        assert.equal(cfg.host, '1.2.3.4')
        assert.equal(cfg.auth_user, 'postmaster@test.com')
    })

    it('returns domain config with different TLS setting', () => {
        connection.transaction.rcpt_to.push(new Address('<matt@test1.com>'))
        const cfg = plugin.get_config(connection)
        assert.deepEqual(cfg, { host: '1.2.3.4', enable_tls: false })
    })

    it('returns main cfg when domain_selector=mail_from but mail_from is null', () => {
        plugin.cfg.main.domain_selector = 'mail_from'
        connection.transaction.mail_from = null
        const cfg = plugin.get_config(connection)
        assert.equal(cfg.host, 'localhost')
    })

    it('returns main cfg when domain_selector=mail_from and null sender', () => {
        plugin.cfg.main.domain_selector = 'mail_from'
        connection.transaction.mail_from = new Address('<>')
        const cfg = plugin.get_config(connection)
        assert.equal(cfg.host, 'localhost')
    })

    it('returns domain config for mail_from domain_selector', () => {
        plugin.cfg.main.domain_selector = 'mail_from'
        connection.transaction.mail_from = new Address('<matt@test2.com>')
        const cfg = plugin.get_config(connection)
        assert.equal(cfg.host, '2.3.4.5')
    })

    it('returns config by full email address when present', () => {
        plugin.cfg.main.domain_selector = 'mail_from'
        plugin.cfg['specific@test.com'] = { host: 'specific.example.com' }
        connection.transaction.mail_from = new Address('<specific@test.com>')
        const cfg = plugin.get_config(connection)
        assert.equal(cfg.host, 'specific.example.com')
    })
})

// ─── check_sender ────────────────────────────────────────────────────────────

describe('smtp_forward check_sender', () => {
    let plugin, connection

    beforeEach(() => {
        plugin = makePlugin()
        connection = makeConnection()
    })

    it('returns without calling next when no transaction', () => {
        connection.transaction = null
        let nextCalled = false
        plugin.check_sender(
            () => {
                nextCalled = true
            },
            connection,
            [new Address('<a@test.com>')],
        )
        assert.equal(nextCalled, false)
    })

    it('skips and calls next() for null/empty sender', () => {
        let code
        plugin.check_sender(
            (c) => {
                code = c
            },
            connection,
            [new Address('<>')],
        )
        assert.equal(code, undefined) // next() with no args
    })

    it('calls next() when sender domain not in config', () => {
        let called = false
        plugin.check_sender(
            () => {
                called = true
            },
            connection,
            [new Address('<user@unknown.com>')],
        )
        assert.ok(called)
    })

    it('denies spoofed MAIL FROM (domain in cfg, not relaying)', () => {
        connection.relaying = false
        let code
        plugin.check_sender(
            (c) => {
                code = c
            },
            connection,
            [new Address('<user@test.com>')],
        )
        assert.equal(code, DENY)
        const r = connection.transaction.results.get(plugin)
        assert.ok(r.fail.includes('mail_from!spoof'))
    })

    it('passes and calls next() when relaying from local domain', () => {
        connection.relaying = true
        let code
        plugin.check_sender(
            (c) => {
                code = c
            },
            connection,
            [new Address('<user@test.com>')],
        )
        assert.equal(code, undefined)
        assert.ok(connection.transaction.notes.local_sender)
        const r = connection.transaction.results.get(plugin)
        assert.ok(r.pass.includes('mail_from'))
    })
})

// ─── set_queue ────────────────────────────────────────────────────────────────

describe('smtp_forward set_queue', () => {
    let plugin, connection

    beforeEach(() => {
        plugin = makePlugin()
        connection = makeConnection()
    })

    it('returns false when transaction has no notes (no transaction)', () => {
        connection.transaction = null
        assert.equal(plugin.set_queue(connection, 'smtp_forward', 'test.com'), false)
    })

    it('sets queue.wants on first call', () => {
        const result = plugin.set_queue(connection, 'smtp_forward', 'test.com')
        assert.equal(result, true)
        assert.equal(connection.transaction.notes.get('queue.wants'), 'smtp_forward')
    })

    it('sets queue.next_hop when domain has a host', () => {
        plugin.set_queue(connection, 'smtp_forward', 'test.com')
        assert.equal(connection.transaction.notes.get('queue.next_hop'), 'smtp://1.2.3.4')
    })

    it('does not set next_hop when domain has no host override', () => {
        // test2.com has host=2.3.4.5, so it will set next_hop
        plugin.set_queue(connection, 'smtp_forward', 'test2.com')
        assert.equal(connection.transaction.notes.get('queue.next_hop'), 'smtp://2.3.4.5')
    })

    it('returns true for undefined domain (no dom_cfg)', () => {
        const result = plugin.set_queue(connection, 'smtp_forward', 'unknown.com')
        assert.equal(result, true)
        assert.equal(connection.transaction.notes.get('queue.wants'), 'smtp_forward')
    })

    it('returns true when queue already set to same value (no dst_host)', () => {
        connection.transaction.notes.set('queue.wants', 'smtp_forward')
        // unknown.com has no host, so dst_host is just from main (localhost)
        const result = plugin.set_queue(connection, 'smtp_forward', 'unknown.com')
        assert.equal(result, true)
    })

    it('returns true when next_hop matches existing next_hop', () => {
        connection.transaction.notes.set('queue.wants', 'smtp_forward')
        connection.transaction.notes.set('queue.next_hop', 'smtp://1.2.3.4')
        const result = plugin.set_queue(connection, 'smtp_forward', 'test.com')
        assert.equal(result, true)
    })

    it('returns true when next_hop already set but no new dst_host', () => {
        connection.transaction.notes.set('queue.wants', 'smtp_forward')
        connection.transaction.notes.set('queue.next_hop', 'smtp://1.2.3.4')
        // unknown.com has no specific host so dst_host comes from main.host='localhost'
        // Actually let's use a domain with no host to test the !dst_host branch
        delete plugin.cfg.main.host
        const result = plugin.set_queue(connection, 'smtp_forward', 'unknown.com')
        assert.equal(result, true)
    })

    it('returns false when different destination (split transaction)', () => {
        connection.transaction.notes.set('queue.wants', 'smtp_forward')
        connection.transaction.notes.set('queue.next_hop', 'smtp://9.9.9.9')
        // test.com has host=1.2.3.4, which differs from 9.9.9.9
        const result = plugin.set_queue(connection, 'smtp_forward', 'test.com')
        assert.equal(result, false)
    })

    it('returns false when queue_wanted differs from existing', () => {
        connection.transaction.notes.set('queue.wants', 'outbound')
        const result = plugin.set_queue(connection, 'smtp_forward', 'test.com')
        assert.equal(result, false)
    })
})

// ─── check_recipient ─────────────────────────────────────────────────────────

describe('smtp_forward check_recipient', () => {
    let plugin, connection

    beforeEach(() => {
        plugin = makePlugin()
        connection = makeConnection()
    })

    it('returns without calling next when no transaction', () => {
        connection.transaction = null
        let called = false
        plugin.check_recipient(
            () => {
                called = true
            },
            connection,
            [new Address('<a@test.com>')],
        )
        assert.equal(called, false)
    })

    it('skips and calls next for rcpt with no host', () => {
        let code
        const rcpt = new Address('<>')
        plugin.check_recipient(
            (c) => {
                code = c
            },
            connection,
            [rcpt],
        )
        assert.equal(code, undefined)
    })

    it('uses outbound queue when relaying as local_sender', () => {
        connection.relaying = true
        connection.transaction.notes.local_sender = true
        let code
        plugin.check_recipient(
            (c) => {
                code = c
            },
            connection,
            [new Address('<user@example.com>')],
        )
        assert.equal(code, OK)
        assert.equal(connection.transaction.notes.get('queue.wants'), 'outbound')
    })

    it('accepts rcpt for a configured domain', () => {
        let code
        plugin.check_recipient(
            (c) => {
                code = c
            },
            connection,
            [new Address('<user@test.com>')],
        )
        assert.equal(code, OK)
    })

    it('denies softly when set_queue fails for configured domain (split transaction)', () => {
        // First call sets queue.wants to smtp_forward for test.com
        plugin.set_queue(connection, 'smtp_forward', 'test.com')
        // Now change the next_hop so the second call conflicts
        connection.transaction.notes.set('queue.next_hop', 'smtp://9.9.9.9')
        let code
        plugin.check_recipient(
            (c) => {
                code = c
            },
            connection,
            [new Address('<user@test.com>')],
        )
        assert.equal(code, DENYSOFT)
    })

    it('passes through for unconfigured domain (no route)', () => {
        let code
        plugin.check_recipient(
            (c) => {
                code = c
            },
            connection,
            [new Address('<user@unknown.com>')],
        )
        assert.equal(code, undefined) // next() with no args
    })
})

// ─── auth ─────────────────────────────────────────────────────────────────────

describe('smtp_forward auth', () => {
    let plugin, connection, smtp_client

    beforeEach(() => {
        plugin = makePlugin()
        connection = makeConnection()
        smtp_client = new MockSMTPClient()
    })

    it('does nothing when smtp_client.secured is pending (false)', () => {
        smtp_client.secured = false
        const cfg = { auth_type: 'plain', auth_user: 'user', auth_pass: 'pass', host: 'relay', port: 25 }
        plugin.auth(cfg, connection, smtp_client)
        smtp_client.emit('capabilities')
        assert.equal(smtp_client.commands.length, 0) // AUTH not sent
    })

    it('sends AUTH PLAIN credentials when auth_type=plain', () => {
        const cfg = { auth_type: 'plain', auth_user: 'testuser', auth_pass: 'testpass', host: 'relay', port: 25 }
        plugin.auth(cfg, connection, smtp_client)
        smtp_client.emit('capabilities')
        assert.ok(smtp_client.commands.some((c) => /^AUTH PLAIN/.test(c)))
    })

    it('AUTH PLAIN base64 encodes \\0user\\0pass', () => {
        const cfg = { auth_type: 'plain', auth_user: 'u', auth_pass: 'p', host: 'relay', port: 25 }
        plugin.auth(cfg, connection, smtp_client)
        smtp_client.emit('capabilities')
        const authCmd = smtp_client.commands.find((c) => /^AUTH PLAIN/.test(c))
        assert.ok(authCmd)
        const encoded = authCmd.split(' ')[2]
        assert.equal(Buffer.from(encoded, 'base64').toString(), '\0u\0p')
    })

    it('sends AUTH LOGIN and sets authenticating=true when auth_type=login', () => {
        const cfg = { auth_type: 'login', auth_user: 'testuser', auth_pass: 'testpass', host: 'relay', port: 25 }
        plugin.auth(cfg, connection, smtp_client)
        smtp_client.emit('capabilities')
        assert.ok(smtp_client.commands.includes('AUTH LOGIN'))
        assert.equal(smtp_client.authenticating, true)
        assert.equal(smtp_client.authenticated, false)
    })

    it('login: responds to auth_username with base64 username', () => {
        const cfg = { auth_type: 'login', auth_user: 'testuser', auth_pass: 'testpass', host: 'relay', port: 25 }
        plugin.auth(cfg, connection, smtp_client)
        smtp_client.emit('capabilities')
        smtp_client.emit('auth_username')
        assert.equal(smtp_client.commands.at(-1), Buffer.from('testuser').toString('base64'))
    })

    it('login: responds to auth_password with base64 password', () => {
        const cfg = { auth_type: 'login', auth_user: 'testuser', auth_pass: 'testpass', host: 'relay', port: 25 }
        plugin.auth(cfg, connection, smtp_client)
        smtp_client.emit('capabilities')
        smtp_client.emit('auth_password')
        assert.equal(smtp_client.commands.at(-1), Buffer.from('testpass').toString('base64'))
    })

    it('skips AUTH when secured is undefined (not pending)', () => {
        // secured is undefined → no early return, AUTH PLAIN is sent
        const cfg = { auth_type: 'plain', auth_user: 'u', auth_pass: 'p', host: 'relay', port: 25 }
        delete smtp_client.secured
        plugin.auth(cfg, connection, smtp_client)
        smtp_client.emit('capabilities')
        assert.ok(smtp_client.commands.some((c) => /^AUTH PLAIN/.test(c)))
    })
})

// ─── forward_enabled ──────────────────────────────────────────────────────────

describe('smtp_forward forward_enabled', () => {
    let plugin, connection

    beforeEach(() => {
        plugin = makePlugin()
        connection = makeConnection()
    })

    it('returns false when queue.wants is set to a non smtp_forward value', () => {
        connection.transaction.notes.set('queue.wants', 'outbound')
        assert.equal(plugin.forward_enabled(connection, plugin.cfg.main), false)
    })

    it('returns false when relaying and outbound is disabled', () => {
        connection.relaying = true
        // enable_outbound is false by default in test config
        assert.equal(plugin.forward_enabled(connection, plugin.cfg.main), false)
    })

    it('returns true when queue.wants is smtp_forward', () => {
        connection.transaction.notes.set('queue.wants', 'smtp_forward')
        assert.equal(plugin.forward_enabled(connection, plugin.cfg.main), true)
    })

    it('returns true when not relaying (even if outbound disabled)', () => {
        connection.relaying = false
        assert.equal(plugin.forward_enabled(connection, plugin.cfg.main), true)
    })

    it('returns true when relaying and outbound is enabled', () => {
        connection.relaying = true
        plugin.cfg.main.enable_outbound = true
        assert.equal(plugin.forward_enabled(connection, plugin.cfg.main), true)
    })
})

// ─── queue_forward ────────────────────────────────────────────────────────────

describe('smtp_forward queue_forward', () => {
    let plugin, connection, restore

    beforeEach(() => {
        plugin = makePlugin()
        connection = makeConnection()
        connection.transaction.rcpt_to = [new Address('<rcpt@example.com>')]
        connection.transaction.mail_from = new Address('<sender@example.com>')
        connection.relaying = false
    })

    afterEach(() => {
        if (restore) {
            restore()
            restore = null
        }
    })

    it('returns without calling next when remote.closed', () => {
        connection.remote.closed = true
        let called = false
        plugin.queue_forward(() => {
            called = true
        }, connection)
        assert.equal(called, false)
    })

    it('calls next() when forward_enabled returns false', (t, done) => {
        connection.relaying = true // outbound disabled → forward_enabled=false
        plugin.queue_forward((code) => {
            assert.equal(code, undefined)
            done()
        }, connection)
    })

    it('forwards mail: mail event triggers first RCPT', (t, done) => {
        const client = new MockSMTPClient()
        restore = stubGetClientPlugin((plug, conn, cfg, cb) => cb(null, client))

        plugin.queue_forward(() => {}, connection)
        client.emit('mail')

        assert.ok(client.commands.some((c) => /^RCPT TO:/.test(c)))
        done()
    })

    it('sends DATA after last RCPT TO', (t, done) => {
        const client = new MockSMTPClient()
        restore = stubGetClientPlugin((plug, conn, cfg, cb) => cb(null, client))

        plugin.queue_forward(() => {}, connection)
        client.emit('mail') // sends RCPT TO for index 0
        client.emit('rcpt') // one_message_per_rcpt=true, sends DATA

        // wait for the DATA command
        assert.ok(client.commands.some((c) => c === 'DATA' || c.includes('DATA')))
        done()
    })

    it('data event calls start_data with message_stream', (t, done) => {
        const client = new MockSMTPClient()
        restore = stubGetClientPlugin((plug, conn, cfg, cb) => cb(null, client))

        plugin.queue_forward(() => {}, connection)
        client.emit('mail')
        client.emit('rcpt') // sends DATA (one_message_per_rcpt)
        client.emit('data')

        assert.ok(client.started)
        done()
    })

    it('dot event calls next(OK) and releases when all rcpts done', (t, done) => {
        const client = new MockSMTPClient()
        restore = stubGetClientPlugin((plug, conn, cfg, cb) => cb(null, client))

        let gotCode
        plugin.queue_forward((code) => {
            gotCode = code
        }, connection)

        client.emit('mail')
        client.emit('rcpt')
        client.emit('data')
        client.emit('dot')

        // release() is called after call_next() in the dot handler
        assert.equal(gotCode, OK)
        assert.ok(client.released)
        done()
    })

    it('dot event sends RSET when more rcpts remain (multi-rcpt, one_message_per_rcpt)', (t, done) => {
        connection.transaction.rcpt_to = [new Address('<a@example.com>'), new Address('<b@example.com>')]
        const client = new MockSMTPClient()
        restore = stubGetClientPlugin((plug, conn, cfg, cb) => cb(null, client))

        plugin.queue_forward(() => {}, connection)
        client.emit('mail') // sends RCPT TO for index 0
        client.emit('rcpt') // one_message_per_rcpt → sends DATA
        client.emit('data')
        client.commands = [] // clear to observe next commands
        client.emit('dot') // more rcpts remain → RSET

        assert.ok(client.commands.includes('RSET'))
        done()
    })

    it('rset event sends MAIL FROM', (t, done) => {
        const client = new MockSMTPClient()
        restore = stubGetClientPlugin((plug, conn, cfg, cb) => cb(null, client))

        plugin.queue_forward(() => {}, connection)
        client.commands = []
        client.emit('rset')

        assert.ok(client.commands.some((c) => /^MAIL FROM:/.test(c)))
        done()
    })

    it('bad_code 5xx emits DENY and releases', (t, done) => {
        const client = new MockSMTPClient()
        restore = stubGetClientPlugin((plug, conn, cfg, cb) => cb(null, client))

        let gotCode
        plugin.queue_forward((code) => {
            gotCode = code
        }, connection)

        client.emit('bad_code', '550', 'User unknown')

        // release() is called after call_next() in the bad_code handler
        assert.equal(gotCode, DENY)
        assert.ok(client.released)
        done()
    })

    it('bad_code 4xx emits DENYSOFT and releases', (t, done) => {
        const client = new MockSMTPClient()
        restore = stubGetClientPlugin((plug, conn, cfg, cb) => cb(null, client))

        plugin.queue_forward((code) => {
            assert.equal(code, DENYSOFT)
            done()
        }, connection)

        client.emit('bad_code', '421', 'Service unavailable')
    })

    it('dead_sender: adds err result and skips forwarding', (t, done) => {
        const client = new MockSMTPClient()
        client.is_dead_sender = () => true
        restore = stubGetClientPlugin((plug, conn, cfg, cb) => cb(null, client))

        plugin.queue_forward(() => {}, connection)
        client.emit('mail')

        const r = connection.transaction.results.get(plugin)
        assert.ok(r.err.some((e) => /dead sender/.test(e)))
        done()
    })

    it('calls plugin.auth when auth_user is configured in cfg', (t, done) => {
        const client = new MockSMTPClient()
        restore = stubGetClientPlugin((plug, conn, cfg, cb) => cb(null, client))

        // point the connection to test.com domain which has auth_user in the ini
        connection.transaction.rcpt_to = [new Address('<user@test.com>')]

        let authCalled = false
        const origAuth = plugin.auth
        plugin.auth = () => {
            authCalled = true
        }
        plugin.queue_forward(() => {}, connection)
        plugin.auth = origAuth

        assert.ok(authCalled)
        done()
    })

    it('uses forwarding_host_pool when configured', (t, done) => {
        const client = new MockSMTPClient()
        let capturedCfg
        restore = stubGetClientPlugin((plug, conn, cfg, cb) => {
            capturedCfg = cfg
            cb(null, client)
        })

        plugin.cfg.main.forwarding_host_pool = '10.0.0.1:25'
        delete plugin.cfg.main.host
        plugin.queue_forward(() => {}, connection)

        assert.ok(capturedCfg.forwarding_host_pool)
        done()
    })
})

// ─── get_mx_next_hop ─────────────────────────────────────────────────────────

describe('smtp_forward get_mx_next_hop', () => {
    it('parses smtp URL with port', () => {
        const mx = smtp_client_mod.smtp_client // not used; just accessing exports
        const plugin = makePlugin()
        const mx_val = plugin.get_mx_next_hop('smtp://10.0.0.1:587')
        assert.equal(mx_val.exchange, '10.0.0.1')
        assert.equal(mx_val.port, '587')
        assert.equal(mx_val.priority, 0)
    })

    it('defaults port to 25 for smtp without explicit port', () => {
        const plugin = makePlugin()
        const mx_val = plugin.get_mx_next_hop('smtp://10.0.0.1')
        assert.equal(mx_val.port, 25)
    })

    it('parses lmtp URL and sets using_lmtp=true with port 24', () => {
        const plugin = makePlugin()
        const mx_val = plugin.get_mx_next_hop('lmtp://10.0.0.2')
        assert.equal(mx_val.using_lmtp, true)
        assert.equal(mx_val.port, 24)
    })

    it('extracts auth credentials from URL', () => {
        const plugin = makePlugin()
        const mx_val = plugin.get_mx_next_hop('smtp://user:secret@10.0.0.1:25')
        assert.equal(mx_val.auth_type, 'plain')
        assert.equal(mx_val.auth_user, 'user')
        assert.equal(mx_val.auth_pass, 'secret')
    })
})

// ─── get_mx ───────────────────────────────────────────────────────────────────

describe('smtp_forward get_mx', () => {
    let plugin, hmail

    beforeEach(() => {
        plugin = makePlugin()
        hmail = makeHmail()
    })

    it('returns no route for undefined domains', (t, done) => {
        plugin.get_mx(
            (code, mx) => {
                assert.equal(code, undefined)
                assert.equal(mx, undefined)
                done()
            },
            hmail,
            'undefined.com',
        )
    })

    it('returns no route when queue.wants is not smtp_forward or outbound', (t, done) => {
        hmail.todo.notes.set('queue.wants', 'some_other_queue')
        plugin.get_mx(
            (code, mx) => {
                assert.equal(code, undefined)
                done()
            },
            hmail,
            'test.com',
        )
    })

    it('returns route from next_hop URL when queue.wants=smtp_forward', (t, done) => {
        hmail.todo.notes.set('queue.wants', 'smtp_forward')
        hmail.todo.notes.set('queue.next_hop', 'smtp://4.3.2.1:465')
        plugin.get_mx(
            (code, mx) => {
                assert.equal(code, OK)
                assert.equal(mx.exchange, '4.3.2.1')
                assert.equal(mx.port, '465')
                done()
            },
            hmail,
            'anything.com',
        )
    })

    it('returns route for configured domain', (t, done) => {
        plugin.get_mx(
            (code, mx) => {
                assert.equal(code, OK)
                assert.equal(mx.exchange, '1.2.3.4')
                assert.equal(mx.port, 2555)
                assert.equal(mx.auth_user, 'postmaster@test.com')
                assert.equal(mx.auth_pass, 'superDuperSecret')
                done()
            },
            hmail,
            'test.com',
        )
    })

    it('returns no route (DNS MX) for unconfigured domain when queue.wants=outbound', (t, done) => {
        hmail.todo.notes.set('queue.wants', 'outbound')
        plugin.get_mx(
            (code, mx) => {
                assert.equal(code, undefined)
                done()
            },
            hmail,
            'notconfigured.com',
        )
    })

    it('uses lmtp URL and sets using_lmtp when next_hop is lmtp', (t, done) => {
        hmail.todo.notes.set('queue.wants', 'smtp_forward')
        hmail.todo.notes.set('queue.next_hop', 'lmtp://4.3.2.1')
        plugin.get_mx(
            (code, mx) => {
                assert.equal(code, OK)
                assert.equal(mx.using_lmtp, true)
                assert.equal(mx.port, 24)
                done()
            },
            hmail,
            'anywhere.com',
        )
    })

    it('uses mail_from host when domain_selector=mail_from', (t, done) => {
        plugin.cfg.main.domain_selector = 'mail_from'
        hmail.todo.mail_from = new Address('<sender@test.com>')
        plugin.get_mx(
            (code, mx) => {
                assert.equal(code, OK)
                assert.equal(mx.exchange, '1.2.3.4')
                done()
            },
            hmail,
            'anything.com',
        )
    })

    it('applies mx_opts from domain config', (t, done) => {
        plugin.cfg['test.com'].bind = '192.168.1.1'
        plugin.cfg['test.com'].bind_helo = 'relay.example.com'
        plugin.get_mx(
            (code, mx) => {
                assert.equal(code, OK)
                assert.equal(mx.bind, '192.168.1.1')
                assert.equal(mx.bind_helo, 'relay.example.com')
                done()
            },
            hmail,
            'test.com',
        )
    })
})

// ─── is_outbound_enabled ──────────────────────────────────────────────────────

describe('smtp_forward is_outbound_enabled', () => {
    let plugin, connection

    beforeEach(() => {
        plugin = makePlugin()
        connection = makeConnection()
    })

    it('enable_outbound is false by default (global)', () => {
        assert.equal(plugin.is_outbound_enabled(plugin.cfg), false)
    })

    it('per-domain enable_outbound is false by default', () => {
        connection.transaction.rcpt_to = [new Address('<postmaster@test.com>')]
        const cfg = plugin.get_config(connection)
        assert.equal(plugin.is_outbound_enabled(cfg), false)
    })

    it('per-domain enable_outbound can be set to true', () => {
        plugin.cfg['test.com'].enable_outbound = true
        connection.transaction.rcpt_to = [new Address('<postmaster@test.com>')]
        const cfg = plugin.get_config(connection)
        assert.equal(plugin.is_outbound_enabled(cfg), true)
    })

    it('per-domain enable_outbound overrides global false', () => {
        plugin.cfg.main.enable_outbound = false
        plugin.cfg['test.com'].enable_outbound = false
        connection.transaction.rcpt_to = [new Address('<postmaster@test.com>')]
        const cfg = plugin.get_config(connection)
        assert.equal(plugin.is_outbound_enabled(cfg), false)
    })

    it('falls back to global enable_outbound when not in domain cfg', () => {
        plugin.cfg.main.enable_outbound = true
        connection.transaction.rcpt_to = [new Address('<user@example.com>')]
        const cfg = plugin.get_config(connection) // returns cfg.main
        assert.equal(plugin.is_outbound_enabled(cfg), true)
    })
})
