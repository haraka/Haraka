'use strict'

const assert = require('node:assert')
const { describe, it, beforeEach } = require('node:test')

const { callHook, makeConnection, makePlugin } = require('haraka-test-fixtures')

describe('auth/flat_file', () => {
    let plugin

    beforeEach(() => {
        plugin = makePlugin('auth/flat_file', { register: false })
        plugin.inherits('auth/auth_base')
        plugin.load_flat_ini()
    })

    describe('load_flat_ini', () => {
        it('populates cfg.users as an object', () => {
            assert.ok(typeof plugin.cfg.users === 'object')
        })

        it('cfg.users defaults to empty object when not configured', () => {
            // default config has no real users
            assert.deepEqual(plugin.cfg.users, {})
        })
    })

    describe('hook_capabilities', () => {
        let conn

        beforeEach(() => {
            conn = makeConnection()
            conn.capabilities = []
            conn.notes.allowed_auth_methods = []
            conn.remote.is_private = false
            conn.tls.enabled = false
        })

        it('skips for public non-TLS connection', (t, done) => {
            callHook(plugin, 'hook_capabilities', conn).then(({ rc }) => {
                assert.equal(rc, undefined)
                assert.equal(conn.capabilities.length, 0)
                done()
            })
        })

        it('adds AUTH methods for private connection (non-TLS)', (t, done) => {
            conn.remote.is_private = true
            plugin.cfg.core.methods = 'PLAIN,LOGIN'
            callHook(plugin, 'hook_capabilities', conn).then(({ rc }) => {
                assert.equal(rc, undefined)
                assert.ok(
                    conn.capabilities.some((c) => c.startsWith('AUTH ')),
                    'AUTH capability should be present',
                )
                done()
            })
        })

        it('adds AUTH methods when TLS is enabled', (t, done) => {
            conn.tls.enabled = true
            plugin.cfg.core.methods = 'PLAIN,LOGIN'
            callHook(plugin, 'hook_capabilities', conn).then(({ rc }) => {
                assert.equal(rc, undefined)
                assert.ok(conn.capabilities.some((c) => c.startsWith('AUTH ')))
                done()
            })
        })

        it('sets allowed_auth_methods on connection notes', (t, done) => {
            conn.tls.enabled = true
            plugin.cfg.core.methods = 'PLAIN,LOGIN'
            callHook(plugin, 'hook_capabilities', conn).then(() => {
                assert.deepEqual(conn.notes.allowed_auth_methods, ['PLAIN', 'LOGIN'])
                done()
            })
        })

        it('does not add AUTH when no methods configured', (t, done) => {
            conn.tls.enabled = true
            plugin.cfg.core.methods = null
            callHook(plugin, 'hook_capabilities', conn).then(() => {
                assert.equal(conn.capabilities.length, 0)
                done()
            })
        })
    })

    describe('get_plain_passwd', () => {
        beforeEach(() => {
            plugin.cfg.users = { alice: 'secret', bob: 'hunter2' }
        })

        it('returns password for known user', (t, done) => {
            plugin.get_plain_passwd('alice', {}, (pw) => {
                assert.equal(pw, 'secret')
                done()
            })
        })

        it('calls cb with no args for unknown user', (t, done) => {
            plugin.get_plain_passwd('unknown', {}, (pw) => {
                assert.equal(pw, undefined)
                done()
            })
        })

        it('handles multiple users', (t, done) => {
            plugin.get_plain_passwd('bob', {}, (pw) => {
                assert.equal(pw, 'hunter2')
                done()
            })
        })

        it('coerces password to string via toString()', (t, done) => {
            plugin.cfg.users.numericuser = 12345
            plugin.get_plain_passwd('numericuser', {}, (pw) => {
                assert.equal(pw, '12345')
                done()
            })
        })
    })
})
