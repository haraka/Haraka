'use strict'

const { describe, it, beforeEach } = require('node:test')
const assert = require('node:assert/strict')

const constants = require('haraka-constants')
const DSN = require('haraka-dsn')

const connection = require('../connection')
const Server = require('../server')

// Expose SMTP result constants as globals (DENY, DENYSOFT, etc.)
constants.import(global)

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeClient(opts = {}) {
    return {
        remotePort: opts.remotePort ?? null,
        remoteAddress: opts.remoteAddress ?? null,
        localPort: opts.localPort ?? null,
        localAddress: opts.localAddress ?? null,
        destroy: () => {},
        pause: () => {},
        resume: () => {},
    }
}

function makeServer(ip = null) {
    return {
        ip_address: ip,
        address() {
            return this.ip_address
        },
    }
}

const setUp = () => {
    this.connection = connection.createConnection(makeClient(), makeServer(), Server.cfg)
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('connection', () => {
    describe('initial properties', () => {
        beforeEach(setUp)

        it('remote object defaults', () => {
            assert.deepEqual(this.connection.remote, {
                ip: null,
                port: null,
                host: null,
                info: null,
                closed: false,
                is_private: false,
                is_local: false,
            })
        })

        it('local object defaults', () => {
            assert.equal(this.connection.local.ip, null)
            assert.equal(this.connection.local.port, null)
            assert.ok(this.connection.local.host, 'local.host is set')
        })

        it('tls object defaults', () => {
            assert.deepEqual(this.connection.tls, {
                enabled: false,
                advertised: false,
                verified: false,
                cipher: {},
            })
        })

        it('hello object defaults', () => {
            assert.equal(this.connection.hello.host, null)
            assert.equal(this.connection.hello.verb, null)
        })

        it('proxy object defaults', () => {
            assert.equal(this.connection.proxy.allowed, false)
            assert.equal(this.connection.proxy.ip, null)
            assert.equal(this.connection.proxy.type, null)
            assert.equal(this.connection.proxy.timer, null)
        })

        it('notes object exists', () => {
            assert.ok(this.connection.notes, 'notes is set')
            assert.equal(typeof this.connection.notes, 'object')
        })

        it('transaction is null', () => {
            assert.equal(this.connection.transaction, null)
        })

        it('capabilities is null', () => {
            assert.equal(this.connection.capabilities, null)
        })

        it('remote.is_private and remote.is_local default to false', () => {
            assert.equal(this.connection.remote.is_private, false)
            assert.equal(this.connection.remote.is_local, false)
        })
    })

    describe('private IP connection', () => {
        beforeEach(() => {
            this.connection = connection.createConnection(
                makeClient({
                    remotePort: 2525,
                    remoteAddress: '172.16.15.1',
                    localPort: 25,
                    localAddress: '172.16.15.254',
                }),
                makeServer('172.16.15.254'),
                Server.cfg,
            )
        })

        it('remote.is_private is true', () => {
            assert.equal(this.connection.remote.is_private, true)
        })

        it('remote.is_local is false', () => {
            assert.equal(this.connection.remote.is_local, false)
        })

        it('remote.port is set', () => {
            assert.equal(this.connection.remote.port, 2525)
        })
    })

    describe('loopback connection', () => {
        beforeEach(() => {
            this.connection = connection.createConnection(
                makeClient({ remotePort: 2525, remoteAddress: '127.0.0.2', localPort: 25, localAddress: '172.0.0.1' }),
                makeServer('127.0.0.1'),
                Server.cfg,
            )
        })

        it('remote.is_private is true', () => {
            assert.equal(this.connection.remote.is_private, true)
        })

        it('remote.is_local is true', () => {
            assert.equal(this.connection.remote.is_local, true)
        })
    })

    describe('get_remote', () => {
        beforeEach(setUp)

        it('formats host and IP', () => {
            this.connection.remote.host = 'a.host.tld'
            this.connection.remote.ip = '172.16.199.198'
            assert.equal(this.connection.get_remote('host'), 'a.host.tld [172.16.199.198]')
        })

        it('falls back to bracketed IP when no host', () => {
            this.connection.remote.ip = '172.16.199.198'
            assert.equal(this.connection.get_remote('host'), '[172.16.199.198]')
        })

        it('DNSERROR suppresses hostname', () => {
            this.connection.remote.host = 'DNSERROR'
            this.connection.remote.ip = '172.16.199.198'
            assert.equal(this.connection.get_remote('host'), '[172.16.199.198]')
        })

        it('NXDOMAIN suppresses hostname', () => {
            this.connection.remote.host = 'NXDOMAIN'
            this.connection.remote.ip = '172.16.199.198'
            assert.equal(this.connection.get_remote('host'), '[172.16.199.198]')
        })
    })

    describe('local.info', () => {
        beforeEach(setUp)

        it('contains Haraka/version', () => {
            assert.match(this.connection.local.info, /Haraka\/\d+\.\d+/)
        })
    })

    describe('get_capabilities', () => {
        beforeEach(setUp)

        it('returns empty array by default', () => {
            assert.deepEqual(this.connection.get_capabilities(), [])
        })
    })

    describe('relaying', () => {
        beforeEach(setUp)

        it('defaults to false', () => {
            assert.equal(this.connection.relaying, false)
        })

        it('set() and get() round-trip on connection', () => {
            this.connection.set('relaying', 'crocodiles')
            assert.equal(this.connection.get('relaying'), 'crocodiles')
            assert.equal(this.connection.relaying, 'crocodiles')
            assert.equal(this.connection._relaying, 'crocodiles')
        })

        it('direct assignment round-trips', () => {
            this.connection.relaying = 'alligators'
            assert.equal(this.connection.get('relaying'), 'alligators')
            assert.equal(this.connection._relaying, 'alligators')
        })

        it('set() with a transaction updates txn, not connection', () => {
            this.connection.transaction = {}
            this.connection.set('relaying', 'txn-only')
            assert.equal(this.connection.get('relaying'), 'txn-only')
            assert.equal(this.connection._relaying, false)
            assert.equal(this.connection.transaction._relaying, 'txn-only')
        })
    })

    describe('get / set', () => {
        beforeEach(setUp)

        it('sets and gets a single-level property', () => {
            this.connection.set('encoding', true)
            assert.ok(this.connection.encoding)
            assert.ok(this.connection.get('encoding'))
        })

        it('sets and gets a two-level property', () => {
            this.connection.set('local.host', 'test')
            assert.equal(this.connection.local.host, 'test')
            assert.equal(this.connection.get('local.host'), 'test')
        })

        it('sets and gets a three-level property', () => {
            this.connection.set('some.fine.example', true)
            assert.ok(this.connection.some.fine.example)
            assert.ok(this.connection.get('some.fine.example'))
        })

        it('sets hello.verb via set()', () => {
            this.connection.set('hello', 'verb', 'EHLO')
            assert.equal(this.connection.hello.verb, 'EHLO')
        })

        it('sets proxy fields via set()', () => {
            this.connection.set('proxy', 'ip', '172.16.15.1')
            this.connection.set('proxy', 'type', 'haproxy')
            this.connection.set('proxy', 'allowed', true)
            assert.equal(this.connection.proxy.ip, '172.16.15.1')
            assert.equal(this.connection.proxy.type, 'haproxy')
            assert.equal(this.connection.proxy.allowed, true)
        })

        it('has normalised connection properties after set()', () => {
            this.connection.set('remote', 'ip', '172.16.15.1')
            this.connection.set('hello', 'verb', 'EHLO')
            this.connection.set('tls', 'enabled', true)
            assert.equal(this.connection.remote.ip, '172.16.15.1')
            assert.equal(this.connection.remote.port, null)
            assert.equal(this.connection.hello.verb, 'EHLO')
            assert.equal(this.connection.hello.host, null)
            assert.equal(this.connection.tls.enabled, true)
        })
    })

    describe('queue_msg', () => {
        beforeEach(setUp)

        it('returns supplied message when given', () => {
            assert.equal(this.connection.queue_msg(1, 'test message'), 'test message')
        })

        it('returns default DENY message', () => {
            assert.equal(this.connection.queue_msg(DENY), 'Message denied')
            assert.equal(this.connection.queue_msg(DENYDISCONNECT), 'Message denied')
        })

        it('returns default DENYSOFT message', () => {
            assert.equal(this.connection.queue_msg(DENYSOFT), 'Message denied temporarily')
            assert.equal(this.connection.queue_msg(DENYSOFTDISCONNECT), 'Message denied temporarily')
        })

        it('returns empty string for unrecognised code', () => {
            assert.equal(this.connection.queue_msg('hello'), '')
        })
    })

    describe('respond', () => {
        beforeEach(setUp)

        it('returns undefined when disconnected', () => {
            this.connection.state = constants.connection.state.DISCONNECTED
            assert.equal(this.connection.respond(200, 'your lucky day'), undefined)
            assert.equal(this.connection.respond(550, 'you are jacked'), undefined)
        })

        it('formats a simple 200 response', () => {
            assert.equal(this.connection.respond(200, 'you may pass Go'), '200 you may pass Go\r\n')
        })

        it('formats a DSN 200 response', () => {
            assert.equal(
                this.connection.respond(200, DSN.create(200, 'you may pass Go')),
                '200 2.0.0 you may pass Go\r\n',
            )
        })

        it('DSN overrides response code', () => {
            assert.equal(
                this.connection.respond(450, DSN.create(550, 'This domain is not in use')),
                '550 5.0.0 This domain is not in use\r\n',
            )
        })

        it('DSN addr_bad_dest_system (5.1.2)', () => {
            assert.equal(
                this.connection.respond(550, DSN.addr_bad_dest_system('Domain not in use', 550)),
                '550 5.1.2 Domain not in use\r\n',
            )
        })

        it('formats multi-line response from array', () => {
            const resp = this.connection.respond(250, ['Hello', 'World'])
            assert.ok(resp.includes('250-Hello\r\n'), 'first line uses dash')
            assert.ok(resp.includes('250 World\r\n'), 'last line uses space')
        })

        it('formats multi-line response from newline-separated string', () => {
            const resp = this.connection.respond(250, 'Hello\nWorld')
            assert.ok(resp.includes('250-Hello\r\n'), 'first line uses dash')
            assert.ok(resp.includes('250 World\r\n'), 'last line uses space')
        })

        it('last_response is updated when client has a write method', () => {
            // When client.write is defined, respond() writes to the socket and
            // stores the formatted buffer in last_response.
            let written = ''
            this.connection.client.write = (buf) => {
                written += buf
            }
            this.connection.respond(250, 'OK')
            assert.ok(written.includes('250 OK'), 'data written to socket')
            assert.ok(this.connection.last_response.includes('250 OK'), 'last_response updated')
        })
    })

    describe('pause and resume', () => {
        beforeEach(setUp)

        it('restores previous state when still paused at resume', () => {
            this.connection.state = constants.connection.state.PAUSE_SMTP
            this.connection.pause()
            this.connection.resume()
            assert.equal(this.connection.state, constants.connection.state.PAUSE_SMTP)
            assert.equal(this.connection.prev_state, null)
        })

        it('does not overwrite state changed while paused', () => {
            this.connection.state = constants.connection.state.PAUSE_SMTP
            this.connection.pause()
            this.connection.state = constants.connection.state.CMD
            this.connection.resume()
            assert.equal(this.connection.state, constants.connection.state.CMD)
            assert.equal(this.connection.prev_state, null)
        })
    })

    describe('loop_respond', () => {
        beforeEach(setUp)

        it('sets state to LOOP', () => {
            this.connection.loop_respond(554, 'Denied')
            assert.equal(this.connection.state, constants.connection.state.LOOP)
        })

        it('records loop_code and loop_msg', () => {
            this.connection.loop_respond(554, 'Denied')
            assert.equal(this.connection.loop_code, 554)
            assert.equal(this.connection.loop_msg, 'Denied')
        })

        it('does nothing when already disconnecting', () => {
            this.connection.state = constants.connection.state.DISCONNECTING
            this.connection.loop_respond(554, 'Denied')
            assert.equal(this.connection.state, constants.connection.state.DISCONNECTING)
        })
    })

    describe('tran_uuid', () => {
        beforeEach(setUp)

        it('increments tran_count on each call', () => {
            assert.equal(this.connection.tran_count, 0)
            const u1 = this.connection.tran_uuid()
            assert.equal(this.connection.tran_count, 1)
            const u2 = this.connection.tran_uuid()
            assert.equal(this.connection.tran_count, 2)
            assert.notEqual(u1, u2)
        })

        it('formats as <connection-uuid>.<count>', () => {
            const u = this.connection.tran_uuid()
            assert.match(u, new RegExp(`^${this.connection.uuid}\\.1$`))
        })
    })

    describe('issue #3374 — double QUIT prevention', () => {
        beforeEach(setUp)

        it('quit hook fires only once when two QUITs arrive in LOOP state', async () => {
            const conn = this.connection
            conn.loop_respond(554, 'Denied')
            assert.equal(conn.state, constants.connection.state.LOOP)

            let quit_hook_calls = 0
            const plugins = require('../plugins')
            const original_run_hooks = plugins.run_hooks
            plugins.run_hooks = (hook, c, params) => {
                if (hook === 'quit') {
                    quit_hook_calls++
                    if (quit_hook_calls === 1) {
                        setTimeout(() => c.quit_respond(constants.ok), 50)
                    }
                    return
                }
                original_run_hooks(hook, c, params)
            }

            conn.process_line(Buffer.from('QUIT\r\n'))
            conn.process_line(Buffer.from('QUIT\r\n'))

            await new Promise((resolve) => {
                setTimeout(() => {
                    plugins.run_hooks = original_run_hooks
                    assert.equal(quit_hook_calls, 1, 'quit hook called exactly once')
                    resolve()
                }, 100)
            })
        })
    })
})
