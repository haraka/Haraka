'use strict'

const assert = require('node:assert')
const path = require('node:path')
const { describe, it, beforeEach, afterEach, before } = require('node:test')

const { makeConnection, makePlugin } = require('haraka-test-fixtures')

const tls_socket = require('../../../tls_socket')

before(() => {
    require('haraka-constants').import(global)
})

describe('queue/smtp_proxy', () => {
    let plugin, conn

    beforeEach(() => {
        plugin = makePlugin('queue/smtp_proxy', { register: false })
        plugin.load_smtp_proxy_ini()
        conn = makeConnection({ withTxn: true })
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
            plugin.hook_rset(() => {
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
            plugin.hook_disconnect(() => {
                assert.equal(released, true)
                assert.equal(callNextCalled, true)
                assert.equal(conn.notes.smtp_client, undefined)
                done()
            }, conn)
        })
    })

    describe('hook_queue', () => {
        it('calls next() when transaction is missing', (t, done) => {
            const connNoTxn = makeConnection()
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

    describe('tls_options', () => {
        let origTlsConfig, origTlsCfg

        beforeEach(() => {
            origTlsConfig = tls_socket.config
            origTlsCfg = tls_socket.cfg
            tls_socket.config = require('haraka-config').module_config(path.resolve('test'))
            tls_socket.cfg = undefined
            // re-derive with test/config in scope
            plugin.load_smtp_proxy_ini()
        })

        afterEach(() => {
            tls_socket.config = origTlsConfig
            tls_socket.cfg = origTlsCfg
        })

        it('populates tls_options from tls.ini [main]', () => {
            assert.ok(plugin.tls_options)
            assert.equal(plugin.tls_options.rejectUnauthorized, false)
            assert.equal(plugin.tls_options.minVersion, 'TLSv1')
            assert.ok(plugin.tls_options.ciphers)
            assert.ok(Array.isArray(plugin.tls_options.no_tls_hosts))
            assert.ok(Array.isArray(plugin.tls_options.force_tls_hosts))
        })

        it('reload re-derives tls_options', () => {
            const first = plugin.tls_options
            plugin.load_smtp_proxy_ini()
            assert.ok(plugin.tls_options)
            assert.notEqual(plugin.tls_options, first)
        })
    })
})
