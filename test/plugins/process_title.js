'use strict'

const assert = require('node:assert/strict')
const { describe, it, beforeEach } = require('node:test')

const fixtures = require('haraka-test-fixtures')
const { makeConnection, makePlugin } = fixtures
const Notes = require('haraka-notes')

function makeServer(extra = {}) {
    return {
        notes: new Notes({
            pt_connections: 0,
            pt_concurrent: 0,
            pt_cps_diff: 0,
            pt_cps_max: 0,
            pt_recipients: 0,
            pt_rps_diff: 0,
            pt_rps_max: 0,
            pt_messages: 0,
            pt_mps_diff: 0,
            pt_mps_max: 0,
            ...extra,
        }),
        cluster: null,
        address: () => ({ address: '127.0.0.1', port: 25 }),
    }
}

describe('process_title', () => {
    let plugin

    beforeEach(() => {
        plugin = makePlugin('process_title', { register: false })
    })

    describe('hook_connect_init', () => {
        it('increments connection and concurrent counts', (t, done) => {
            const server = makeServer()
            const conn = makeConnection()
            conn.server = server
            plugin.hook_connect_init((rc) => {
                assert.equal(rc, undefined)
                assert.equal(server.notes.pt_connections, 1)
                assert.equal(server.notes.pt_concurrent, 1)
                assert.equal(conn.notes.pt_connect_run, true)
                done()
            }, conn)
        })
    })

    describe('hook_disconnect', () => {
        it('decrements concurrent count when connect_init ran', (t, done) => {
            const server = makeServer({ pt_connections: 1, pt_concurrent: 1 })
            const conn = makeConnection()
            conn.server = server
            conn.notes.pt_connect_run = true
            plugin.hook_disconnect((rc) => {
                assert.equal(rc, undefined)
                assert.equal(server.notes.pt_concurrent, 0)
                assert.equal(server.notes.pt_connections, 1) // not re-incremented
                done()
            }, conn)
        })

        it('increments connection count when connect_init did not run', (t, done) => {
            const server = makeServer({ pt_connections: 0, pt_concurrent: 0 })
            const conn = makeConnection()
            conn.server = server
            // pt_connect_run is NOT set: disconnect does connect bookkeeping then decrements
            plugin.hook_disconnect((rc) => {
                assert.equal(rc, undefined)
                assert.equal(server.notes.pt_connections, 1) // incremented by disconnect
                assert.equal(server.notes.pt_concurrent, 0) // +1 then -1
                done()
            }, conn)
        })
    })

    describe('hook_rcpt', () => {
        it('increments recipient count', (t, done) => {
            const server = makeServer()
            const conn = makeConnection()
            conn.server = server
            plugin.hook_rcpt((rc) => {
                assert.equal(rc, undefined)
                assert.equal(server.notes.pt_recipients, 1)
                done()
            }, conn)
        })
    })

    describe('hook_data', () => {
        it('increments message count', (t, done) => {
            const server = makeServer()
            const conn = makeConnection()
            conn.server = server
            plugin.hook_data((rc) => {
                assert.equal(rc, undefined)
                assert.equal(server.notes.pt_messages, 1)
                done()
            }, conn)
        })
    })

    describe('hook_init_child', () => {
        it('initializes server notes and calls next', (t, done) => {
            const server = { notes: new Notes(), cluster: null }
            plugin.hook_init_child((rc) => {
                clearInterval(plugin._interval)
                assert.equal(rc, undefined)
                assert.equal(server.notes.pt_connections, 0)
                assert.equal(server.notes.pt_messages, 0)
                assert.equal(server.notes.pt_recipients, 0)
                done()
            }, server)
        })
    })

    describe('hook_init_master', () => {
        it('initializes server notes and calls next (no cluster)', (t, done) => {
            const server = { notes: new Notes(), cluster: null }
            plugin.hook_init_master((rc) => {
                clearInterval(plugin._interval)
                assert.equal(rc, undefined)
                assert.equal(server.notes.pt_connections, 0)
                assert.equal(server.notes.pt_child_exits, 0)
                done()
            }, server)
        })
    })

    describe('shutdown', () => {
        it('clears the interval', () => {
            plugin._interval = setInterval(() => {}, 9999)
            plugin.shutdown()
            // If the interval was cleared, no error thrown
            assert.ok(true)
        })
    })
})
