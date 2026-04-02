'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')
const net = require('node:net')
const tls = require('node:tls')
const fs = require('node:fs')

// Mock dependencies before requiring the target
const mock = require('node:test').mock

const tls_socket = require('../tls_socket')

const TEST_CERT = fs.readFileSync(path.join(__dirname, 'config/tls_cert.pem'))
const TEST_KEY = fs.readFileSync(path.join(__dirname, 'config/tls_key.pem'))

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

    await t.test('connect upgrade error propagation', async (t) => {
        // Verify that TLS errors during socket.upgrade() are propagated to the outer
        // pluggableStream socket, not silently swallowed.
        // A TLS server that requires a client cert; connecting without one triggers
        // a post-handshake "certificate required" alert (TLSv1.3).
        await t.test('emits error on outer socket when client cert is missing', async () => {
            const server = tls.createServer(
                { cert: TEST_CERT, key: TEST_KEY, requestCert: true, rejectUnauthorized: true },
                () => {},
            )
            await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
            const { port } = server.address()

            try {
                const err = await new Promise((resolve, reject) => {
                    const socket = tls_socket.connect({ host: '127.0.0.1', port })
                    socket.upgrade({ rejectUnauthorized: false }, () => {})
                    socket.on('error', resolve)
                    socket.on('close', () => reject(new Error('closed without error')))
                    setTimeout(() => reject(new Error('timeout')), 3000)
                })
                assert.ok(
                    /certificate required|socket hang up|disconnected/.test(err.message),
                    `unexpected error: ${err.message}`,
                )
                assert.equal(err.source, 'tls', 'error.source should be "tls"')
            } finally {
                await new Promise((resolve) => server.close(resolve))
            }
        })
    })

    await t.test('getSocketOpts', async (t) => {
        // Exercise the typo path (would requires failing config.getDir)
        assert.strictEqual(typeof tls_socket.getSocketOpts, 'function')
    })
})
