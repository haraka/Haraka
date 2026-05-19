'use strict'

const assert = require('node:assert')
const path = require('node:path')
const Module = require('node:module')
const { describe, it, beforeEach, before, after } = require('node:test')

const fixtures = require('haraka-test-fixtures')

// smtp_proxy.js requires './smtp_client' at the top level. Since
// plugins/queue/smtp_client.js does not exist in this environment,
// we intercept Module._resolveFilename and pre-populate the require cache.
const smtpClientPath = path.resolve('plugins/queue/smtp_client.js')
let mockSmtpClientMod
let origResolve

before(() => {
    require('haraka-constants').import(global)

    mockSmtpClientMod = { get_client_plugin: () => {} }
    require.cache[smtpClientPath] = {
        id: smtpClientPath,
        filename: smtpClientPath,
        loaded: true,
        exports: mockSmtpClientMod,
    }

    origResolve = Module._resolveFilename
    Module._resolveFilename = function (request, parent, isMain, options) {
        if (request === './smtp_client') return smtpClientPath
        return origResolve.call(this, request, parent, isMain, options)
    }
})

after(() => {
    Module._resolveFilename = origResolve
    delete require.cache[smtpClientPath]
})

describe('queue/smtp_proxy', () => {
    let plugin, conn

    beforeEach(() => {
        plugin = new fixtures.plugin('queue/smtp_proxy')
        plugin.load_smtp_proxy_ini()
        conn = fixtures.connection.createConnection()
        conn.init_transaction()
    })

    describe('hook_rset', () => {
        it('calls next() when no smtp_client in notes', (t, done) => {
            plugin.hook_rset((rc) => {
                assert.equal(rc, undefined)
                done()
            }, conn)
        })

        it('releases smtp_client and calls next() when smtp_client exists', (t, done) => {
            let released = false
            conn.notes.smtp_client = {
                release: () => {
                    released = true
                },
            }
            plugin.hook_rset((rc) => {
                assert.equal(released, true)
                assert.equal(conn.notes.smtp_client, undefined)
                done()
            }, conn)
        })
    })

    describe('hook_quit', () => {
        it('calls next() when no smtp_client in notes', (t, done) => {
            plugin.hook_quit((rc) => {
                assert.equal(rc, undefined)
                done()
            }, conn)
        })

        it('is the same function as hook_rset', () => {
            assert.equal(plugin.hook_rset, plugin.hook_quit)
        })
    })

    describe('hook_disconnect', () => {
        it('calls next() when no smtp_client in notes', (t, done) => {
            plugin.hook_disconnect((rc) => {
                assert.equal(rc, undefined)
                done()
            }, conn)
        })

        it('releases and calls next when smtp_client exists', (t, done) => {
            let released = false
            let callNextCalled = false
            conn.notes.smtp_client = {
                release: () => {
                    released = true
                },
                call_next: () => {
                    callNextCalled = true
                },
            }
            plugin.hook_disconnect((rc) => {
                assert.equal(released, true)
                assert.equal(callNextCalled, true)
                assert.equal(conn.notes.smtp_client, undefined)
                done()
            }, conn)
        })
    })

    describe('hook_queue', () => {
        it('calls next() when transaction is missing', (t, done) => {
            const connNoTxn = fixtures.connection.createConnection()
            plugin.hook_queue((rc) => {
                assert.equal(rc, undefined)
                done()
            }, connNoTxn)
        })

        it('calls next() when smtp_client is not in notes', (t, done) => {
            plugin.hook_queue((rc) => {
                assert.equal(rc, undefined)
                done()
            }, conn)
        })
    })
})
