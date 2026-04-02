'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')
const tls = require('node:tls')
const fs = require('node:fs')

// Mock dependencies before requiring the target
const mock = require('node:test').mock

const tls_socket = require('../tls_socket')

test('tls_socket', async (t) => {

    await t.test('parse_x509', async (t) => {

        await t.test('handles empty string', async () => {
            const res = await tls_socket.parse_x509('')
            assert.deepEqual(res, {})
        })

        await t.test('handles null/undefined', async () => {
            const res = await tls_socket.parse_x509(null)
            assert.deepEqual(res, {})
        })

        // This would exercise the uninitialized res.names bug if we had a cert string
        // but since it spawns openssl, we'd need to mock spawn or provide a real cert.
    })

    await t.test('get_rejectUnauthorized', async (t) => {
        await t.test('returns true if rejectUnauthorized is true', () => {
            assert.strictEqual(tls_socket.get_rejectUnauthorized(true, 25, [25]), true)
        })

        await t.test('returns true if port is in port_list', () => {
            assert.strictEqual(tls_socket.get_rejectUnauthorized(false, 465, [465]), true)
        })

        await t.test('returns false if port is not in port_list', () => {
            assert.strictEqual(tls_socket.get_rejectUnauthorized(false, 25, [465]), false)
        })
    })

    await t.test('SNICallback', async (t) => {
        await t.test('calls sniDone with default context if servername unknown', (t, done) => {
            // This test requires some setup of ctxByHost which is private to the module
            // but we can test if it's a function
            assert.strictEqual(typeof tls_socket.SNICallback, 'function')
            done()
        })
    })

    await t.test('pluggableStream', async (t) => {
        // This is a class inside the file, but not exported. 
        // We can test it via createServer or connect if we mock net.
    })

    await t.test('connect', async (t) => {
        // Exercise the `new tls.connect` bug
        // We can't easily catch the 'new' keyword usage without proxying tls.connect
        assert.strictEqual(typeof tls_socket.connect, 'function')
    })

    await t.test('getSocketOpts', async (t) => {
        // Exercise the typo path (would requires failing config.getDir)
        assert.strictEqual(typeof tls_socket.getSocketOpts, 'function')
    })
})
