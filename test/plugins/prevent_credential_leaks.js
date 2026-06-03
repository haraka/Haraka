'use strict'

const assert = require('node:assert/strict')
const { describe, it, beforeEach } = require('node:test')

const { makeConnection, makePlugin } = require('haraka-test-fixtures')
require('haraka-constants').import(global)

function buildConnection({ authUser, authPasswd, bodytext = '', children = [] } = {}) {
    const conn = makeConnection({ withTxn: true })
    if (authUser) conn.notes.auth_user = authUser
    if (authPasswd) conn.notes.auth_passwd = authPasswd
    conn.transaction.body = { bodytext, children }
    return conn
}

describe('prevent_credential_leaks', () => {
    let plugin

    beforeEach(() => {
        plugin = makePlugin('prevent_credential_leaks', { register: false })
    })

    describe('hook_data', () => {
        it('does not enable parse_body when no auth credentials', (t, done) => {
            const conn = buildConnection()
            conn.transaction.parse_body = false
            plugin.hook_data((rc) => {
                assert.equal(rc, undefined)
                assert.equal(conn.transaction.parse_body, false)
                done()
            }, conn)
        })

        it('enables parse_body when both auth_user and auth_passwd are present', (t, done) => {
            const conn = buildConnection({ authUser: 'user@example.com', authPasswd: 'secret' })
            conn.transaction.parse_body = false
            plugin.hook_data((rc) => {
                assert.equal(rc, undefined)
                assert.equal(conn.transaction.parse_body, true)
                done()
            }, conn)
        })

        it('does not enable parse_body when only auth_user is set', (t, done) => {
            const conn = buildConnection({ authUser: 'user@example.com' })
            conn.transaction.parse_body = false
            plugin.hook_data((rc) => {
                assert.equal(rc, undefined)
                assert.equal(conn.transaction.parse_body, false)
                done()
            }, conn)
        })

        it('handles missing connection gracefully', (t, done) => {
            // Simulate a null-ish connection by calling with empty notes
            const conn = makeConnection({ withTxn: true })
            conn.notes = {}
            plugin.hook_data((rc) => {
                assert.equal(rc, undefined)
                done()
            }, conn)
        })
    })

    describe('hook_data_post', () => {
        it('calls next when no auth credentials are set', (t, done) => {
            const conn = buildConnection({ bodytext: 'user@example.com secret123' })
            plugin.hook_data_post((rc) => {
                assert.equal(rc, undefined)
                done()
            }, conn)
        })

        it('calls next when only auth_user is set (no password)', (t, done) => {
            const conn = buildConnection({ authUser: 'user@example.com', bodytext: 'user@example.com' })
            plugin.hook_data_post((rc) => {
                assert.equal(rc, undefined)
                done()
            }, conn)
        })

        it('calls next when body contains neither username nor password', (t, done) => {
            const conn = buildConnection({
                authUser: 'alice@example.com',
                authPasswd: 'mypassword',
                bodytext: 'Hello, this is a clean email with no credentials.',
            })
            plugin.hook_data_post((rc) => {
                assert.equal(rc, undefined)
                done()
            }, conn)
        })

        it('calls next when body contains username but not password', (t, done) => {
            const conn = buildConnection({
                authUser: 'alice@example.com',
                authPasswd: 'mypassword',
                bodytext: 'Contact alice@example.com for more info.',
            })
            plugin.hook_data_post((rc) => {
                assert.equal(rc, undefined)
                done()
            }, conn)
        })

        it('denies when body contains both username and password', (t, done) => {
            const conn = buildConnection({
                authUser: 'alice@example.com',
                authPasswd: 'mypassword',
                bodytext: 'Please send your login: alice and password: mypassword to activate.',
            })
            plugin.hook_data_post((rc, msg) => {
                assert.equal(rc, DENY)
                assert.ok(msg.includes('Credential leak'))
                done()
            }, conn)
        })

        it('denies when credentials appear in a child body part', (t, done) => {
            const conn = makeConnection({ withTxn: true })
            conn.notes.auth_user = 'bob@example.com'
            conn.notes.auth_passwd = 's3cr3t'
            conn.transaction.body = {
                bodytext: 'clean parent text',
                children: [{ bodytext: 'bob login with s3cr3t password', children: [] }],
            }
            plugin.hook_data_post((rc) => {
                assert.equal(rc, DENY)
                done()
            }, conn)
        })

        it('handles qualified username (user@domain) by making domain optional', (t, done) => {
            const conn = buildConnection({
                authUser: 'carol@corp.example.com',
                authPasswd: 'pass123',
                bodytext: 'carol pass123 credentials',
            })
            plugin.hook_data_post((rc) => {
                assert.equal(rc, DENY)
                done()
            }, conn)
        })

        it('unqualified username (no @) is not split into a partial match', (t, done) => {
            // Bug: `if (idx)` with idx === -1 treated 'admin' as qualified,
            // splitting it to user='admi' which then matches 'admiral'.
            const conn = buildConnection({
                authUser: 'admin',
                authPasswd: 'pw',
                bodytext: 'the admiral said pw today',
            })
            plugin.hook_data_post((rc) => {
                assert.equal(rc, undefined)
                done()
            }, conn)
        })

        it('calls next when credentials appear in neither top nor child', (t, done) => {
            const conn = makeConnection({ withTxn: true })
            conn.notes.auth_user = 'dave@example.com'
            conn.notes.auth_passwd = 'xyzzy'
            conn.transaction.body = {
                bodytext: 'Hello world',
                children: [{ bodytext: 'No credentials here at all', children: [] }],
            }
            plugin.hook_data_post((rc) => {
                assert.equal(rc, undefined)
                done()
            }, conn)
        })
    })
})
