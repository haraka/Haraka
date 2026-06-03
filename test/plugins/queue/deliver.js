'use strict'

const assert = require('node:assert')
const path = require('node:path')
const Module = require('node:module')
const { describe, it, beforeEach, before, after } = require('node:test')

const { makeConnection, makePlugin } = require('haraka-test-fixtures')

// deliver.js does `require('./outbound')` at the top level. In a running
// Haraka that resolves to the core outbound module (Haraka/outbound/index.js),
// which we don't want to load here: it would pull in the real delivery
// machinery. So we intercept Module._resolveFilename to map './outbound' to a
// stable path and pre-populate the require cache with a mock at that path
// before loading the plugin.
const outboundPath = path.resolve('outbound/index.js')
let mockOutbound
let origResolve

before(() => {
    require('haraka-constants').import(global)

    mockOutbound = { send_trans_email: () => {} }
    require.cache[outboundPath] = {
        id: outboundPath,
        filename: outboundPath,
        loaded: true,
        exports: mockOutbound,
    }

    origResolve = Module._resolveFilename
    Module._resolveFilename = function (request, parent, isMain, options) {
        if (request === './outbound') return outboundPath
        return origResolve.call(this, request, parent, isMain, options)
    }
})

after(() => {
    Module._resolveFilename = origResolve
    delete require.cache[outboundPath]
})

function buildConnection(opts = {}) {
    const conn = makeConnection({ withTxn: true })
    if (opts.relaying !== undefined) conn.relaying = opts.relaying
    return conn
}

describe('queue/deliver', () => {
    describe('hook_queue_outbound', () => {
        let plugin, conn

        beforeEach(() => {
            plugin = makePlugin('queue/deliver')
            mockOutbound.send_trans_email = () => {}
        })

        it('calls next() when connection is not relaying', (t, done) => {
            conn = buildConnection({ relaying: false })
            plugin.hook_queue_outbound((rc) => {
                assert.equal(rc, undefined)
                done()
            }, conn)
        })

        it('calls next() when connection is undefined', (t, done) => {
            plugin.hook_queue_outbound((rc) => {
                assert.equal(rc, undefined)
                done()
            }, undefined)
        })

        it('calls outbound.send_trans_email when relaying is true', (t, done) => {
            conn = buildConnection({ relaying: true })
            mockOutbound.send_trans_email = (txn, next) => {
                assert.equal(txn, conn.transaction)
                next(OK)
            }
            plugin.hook_queue_outbound((rc) => {
                assert.equal(rc, OK)
                done()
            }, conn)
        })

        it('passes transaction to outbound.send_trans_email', (t, done) => {
            conn = buildConnection({ relaying: true })
            let capturedTxn
            mockOutbound.send_trans_email = (txn, next) => {
                capturedTxn = txn
                next(OK)
            }
            plugin.hook_queue_outbound(() => {
                assert.equal(capturedTxn, conn.transaction)
                done()
            }, conn)
        })
    })
})
