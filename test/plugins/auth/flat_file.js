'use strict'

const assert = require('node:assert')
const { describe, it, beforeEach } = require('node:test')

const fixtures = require('haraka-test-fixtures')

function makeConnection(opts = {}) {
    const conn = fixtures.connection.createConnection()
    conn.capabilities = []
    conn.notes.allowed_auth_methods = []
    conn.remote = { is_private: opts.is_private ?? false }
    conn.tls = { enabled: opts.tls_enabled ?? false }
    return conn
}

describe('auth/flat_file', () => {
    let plugin

    beforeEach(() => {
        plugin = new fixtures.plugin('auth/flat_file')
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
        })

        it('skips for public non-TLS connection', (t, done) => {
            plugin.hook_capabilities((rc) => {
                assert.equal(rc, undefined)
                assert.equal(conn.capabilities.length, 0)
                done()
            }, conn)
        })

        it('adds AUTH methods for private connection (non-TLS)', (t, done) => {
            conn.remote.is_private = true
            plugin.cfg.core.methods = 'PLAIN,LOGIN'
            plugin.hook_capabilities((rc) => {
                assert.equal(rc, undefined)
                assert.ok(
                    conn.capabilities.some((c) => c.startsWith('AUTH ')),
                    'AUTH capability should be present',
                )
                done()
            }, conn)
        })

        it('adds AUTH methods when TLS is enabled', (t, done) => {
            conn.tls.enabled = true
            plugin.cfg.core.methods = 'PLAIN,LOGIN'
            plugin.hook_capabilities((rc) => {
                assert.equal(rc, undefined)
                assert.ok(conn.capabilities.some((c) => c.startsWith('AUTH ')))
                done()
            }, conn)
        })

        it('sets allowed_auth_methods on connection notes', (t, done) => {
            conn.tls.enabled = true
            plugin.cfg.core.methods = 'PLAIN,LOGIN'
            plugin.hook_capabilities(() => {
                assert.deepEqual(conn.notes.allowed_auth_methods, ['PLAIN', 'LOGIN'])
                done()
            }, conn)
        })

        it('does not add AUTH when no methods configured', (t, done) => {
            conn.tls.enabled = true
            plugin.cfg.core.methods = null
            plugin.hook_capabilities(() => {
                assert.equal(conn.capabilities.length, 0)
                done()
            }, conn)
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
