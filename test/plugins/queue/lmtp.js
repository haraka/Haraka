'use strict'

const assert = require('node:assert')
const { describe, it, beforeEach, before } = require('node:test')

const fixtures = require('haraka-test-fixtures')

before(() => {
    require('haraka-constants').import(global)
})

describe('queue/lmtp', () => {
    describe('hook_get_mx', () => {
        let plugin

        beforeEach(() => {
            plugin = new fixtures.plugin('queue/lmtp')
            plugin.load_lmtp_ini()
        })

        it('calls next() when hmail does not have using_lmtp note', (t, done) => {
            const hmail = { todo: { notes: {} } }
            plugin.hook_get_mx(
                (rc, mx) => {
                    assert.equal(rc, undefined)
                    assert.equal(mx, undefined)
                    done()
                },
                hmail,
                'example.com',
            )
        })

        it('returns OK with default host and port when using_lmtp is set', (t, done) => {
            const hmail = { todo: { notes: { using_lmtp: true } } }
            plugin.cfg = { main: {} }
            plugin.hook_get_mx(
                (rc, mx) => {
                    assert.equal(rc, OK)
                    assert.equal(mx.using_lmtp, true)
                    assert.equal(mx.exchange, '127.0.0.1')
                    assert.equal(mx.port, 24)
                    assert.equal(mx.priority, 0)
                    done()
                },
                hmail,
                'example.com',
            )
        })

        it('uses domain-specific section when available', (t, done) => {
            const hmail = { todo: { notes: { using_lmtp: true } } }
            plugin.cfg = {
                main: { host: '127.0.0.1' },
                'example.com': { host: 'lmtp.example.com', port: 2400 },
            }
            plugin.hook_get_mx(
                (rc, mx) => {
                    assert.equal(rc, OK)
                    assert.equal(mx.exchange, 'lmtp.example.com')
                    assert.equal(mx.port, 2400)
                    done()
                },
                hmail,
                'example.com',
            )
        })

        it('falls back to main section when no domain-specific section', (t, done) => {
            const hmail = { todo: { notes: { using_lmtp: true } } }
            plugin.cfg = { main: { host: 'lmtp.default.com', port: 24 } }
            plugin.hook_get_mx(
                (rc, mx) => {
                    assert.equal(rc, OK)
                    assert.equal(mx.exchange, 'lmtp.default.com')
                    done()
                },
                hmail,
                'other.com',
            )
        })

        it('includes path in mx when configured', (t, done) => {
            const hmail = { todo: { notes: { using_lmtp: true } } }
            plugin.cfg = { main: { host: '127.0.0.1', path: '/var/run/lmtp.sock' } }
            plugin.hook_get_mx(
                (rc, mx) => {
                    assert.equal(rc, OK)
                    assert.equal(mx.path, '/var/run/lmtp.sock')
                    done()
                },
                hmail,
                'example.com',
            )
        })

        it('does not include path in mx when not configured', (t, done) => {
            const hmail = { todo: { notes: { using_lmtp: true } } }
            plugin.cfg = { main: {} }
            plugin.hook_get_mx(
                (rc, mx) => {
                    assert.equal(rc, OK)
                    assert.equal(mx.path, undefined)
                    done()
                },
                hmail,
                'example.com',
            )
        })
    })

    describe('hook_queue', () => {
        let plugin, conn

        beforeEach(() => {
            plugin = new fixtures.plugin('queue/lmtp')
            plugin.load_lmtp_ini()
            conn = fixtures.connection.createConnection()
            conn.init_transaction()
        })

        it('calls next() when there is no transaction', (t, done) => {
            const connNoTxn = fixtures.connection.createConnection()
            plugin.hook_queue((rc) => {
                assert.equal(rc, undefined)
                done()
            }, connNoTxn)
        })

        it('calls next() when queue.wants is set to another plugin', (t, done) => {
            conn.transaction.notes.set('queue.wants', 'smtp_forward')
            plugin.hook_queue((rc) => {
                assert.equal(rc, undefined)
                done()
            }, conn)
        })
    })
})
