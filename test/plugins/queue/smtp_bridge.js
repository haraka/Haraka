'use strict'

const assert = require('node:assert')
const { describe, it, beforeEach, before } = require('node:test')

const { makeConnection, makePlugin } = require('haraka-test-fixtures')

before(() => {
    require('haraka-constants').import(global)
})

describe('queue/smtp_bridge', () => {
    describe('hook_data_post', () => {
        let plugin, conn

        beforeEach(() => {
            plugin = makePlugin('queue/smtp_bridge')
            plugin.load_flat_ini()
            conn = makeConnection({ withTxn: true })
        })

        it('calls next() when no transaction', (t, done) => {
            const connNoTxn = makeConnection()
            plugin.hook_data_post((rc) => {
                assert.equal(rc, undefined)
                done()
            }, connNoTxn)
        })

        it('copies auth_user from connection notes to transaction notes', (t, done) => {
            conn.notes.auth_user = 'alice'
            conn.notes.auth_passwd = 'secret'
            plugin.hook_data_post((rc) => {
                assert.equal(rc, undefined)
                assert.equal(conn.transaction.notes.auth_user, 'alice')
                done()
            }, conn)
        })

        it('copies auth_passwd from connection notes to transaction notes', (t, done) => {
            conn.notes.auth_user = 'bob'
            conn.notes.auth_passwd = 'mypassword'
            plugin.hook_data_post(() => {
                assert.equal(conn.transaction.notes.auth_passwd, 'mypassword')
                done()
            }, conn)
        })

        it('copies undefined auth values when not set on connection', (t, done) => {
            plugin.hook_data_post(() => {
                assert.equal(conn.transaction.notes.auth_user, undefined)
                assert.equal(conn.transaction.notes.auth_passwd, undefined)
                done()
            }, conn)
        })
    })

    describe('hook_get_mx', () => {
        let plugin

        beforeEach(() => {
            plugin = makePlugin('queue/smtp_bridge')
        })

        it('returns OK with default priority 10 and configured host', (t, done) => {
            plugin.cfg.main = { host: 'relay.example.com' }
            const hmail = { todo: { notes: {} } }
            plugin.hook_get_mx(
                (rc, mx) => {
                    assert.equal(rc, OK)
                    assert.equal(mx.priority, 10)
                    assert.equal(mx.exchange, 'relay.example.com')
                    done()
                },
                hmail,
                'example.com',
            )
        })

        it('uses configured priority when set', (t, done) => {
            plugin.cfg.main = { host: 'relay.example.com', priority: 20 }
            const hmail = { todo: { notes: {} } }
            plugin.hook_get_mx(
                (rc, mx) => {
                    assert.equal(rc, OK)
                    assert.equal(mx.priority, 20)
                    done()
                },
                hmail,
                'example.com',
            )
        })

        it('passes auth_type from config', (t, done) => {
            plugin.cfg.main = { host: 'relay.example.com', auth_type: 'PLAIN' }
            const hmail = { todo: { notes: {} } }
            plugin.hook_get_mx(
                (rc, mx) => {
                    assert.equal(rc, OK)
                    assert.equal(mx.auth_type, 'PLAIN')
                    done()
                },
                hmail,
                'example.com',
            )
        })

        it('passes port from config', (t, done) => {
            plugin.cfg.main = { host: 'relay.example.com', port: '587' }
            const hmail = { todo: { notes: {} } }
            plugin.hook_get_mx(
                (rc, mx) => {
                    assert.equal(rc, OK)
                    assert.equal(mx.port, '587')
                    done()
                },
                hmail,
                'example.com',
            )
        })

        it('passes auth_user and auth_pass from hmail notes', (t, done) => {
            plugin.cfg.main = { host: 'relay.example.com' }
            const hmail = { todo: { notes: { auth_user: 'alice', auth_passwd: 'secret' } } }
            plugin.hook_get_mx(
                (rc, mx) => {
                    assert.equal(rc, OK)
                    assert.equal(mx.auth_user, 'alice')
                    assert.equal(mx.auth_pass, 'secret')
                    done()
                },
                hmail,
                'example.com',
            )
        })

        it('sets port null and auth_type null when not configured', (t, done) => {
            plugin.cfg.main = { host: 'relay.example.com' }
            const hmail = { todo: { notes: {} } }
            plugin.hook_get_mx(
                (rc, mx) => {
                    assert.equal(rc, OK)
                    assert.equal(mx.port, null)
                    assert.equal(mx.auth_type, null)
                    done()
                },
                hmail,
                'example.com',
            )
        })
    })
})
