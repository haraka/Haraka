'use strict'

const assert = require('node:assert/strict')
const { describe, it, beforeEach } = require('node:test')

const fixtures = require('haraka-test-fixtures')

describe('tarpit', () => {
    let plugin

    beforeEach(() => {
        plugin = new fixtures.plugin('tarpit')
        plugin.config.get = () => ({ main: {} })
    })

    describe('register', () => {
        it('registers tarpit on all default hooks', () => {
            const registered = []
            plugin.register_hook = (hook) => registered.push(hook)
            plugin.register()
            assert.ok(registered.includes('connect'))
            assert.ok(registered.includes('ehlo'))
            assert.ok(registered.includes('mail'))
            assert.ok(registered.includes('rcpt'))
            assert.ok(registered.includes('data'))
            assert.ok(registered.includes('queue'))
            assert.ok(registered.includes('quit'))
        })

        it('registers only configured hooks when hooks_to_delay is set', () => {
            plugin.config.get = () => ({ main: { hooks_to_delay: 'ehlo, mail' } })
            const registered = []
            plugin.register_hook = (hook) => registered.push(hook)
            plugin.register()
            assert.deepEqual(registered, ['ehlo', 'mail'])
        })
    })

    describe('tarpit', () => {
        let conn

        beforeEach(() => {
            conn = fixtures.connection.createConnection()
            conn.init_transaction()
        })

        it('calls next immediately when no transaction', (t, done) => {
            conn.transaction = null
            plugin.tarpit((rc) => {
                assert.equal(rc, undefined)
                done()
            }, conn)
        })

        it('calls next immediately when no tarpit delay set', (t, done) => {
            // No tarpit note on connection or transaction
            plugin.tarpit((rc) => {
                assert.equal(rc, undefined)
                done()
            }, conn)
        })

        it('calls next immediately when connection.notes.tarpit is 0', (t, done) => {
            conn.notes.tarpit = 0
            plugin.tarpit((rc) => {
                assert.equal(rc, undefined)
                done()
            }, conn)
        })

        it('delays and calls next when connection.notes.tarpit is set', { timeout: 3000 }, (t, done) => {
            conn.notes.tarpit = 0.1
            const start = Date.now()
            plugin.tarpit((rc) => {
                assert.equal(rc, undefined)
                assert.ok(Date.now() - start >= 90, 'should have waited ~100ms')
                done()
            }, conn)
        })

        it('uses transaction.notes.tarpit when connection note is absent', { timeout: 3000 }, (t, done) => {
            conn.transaction.notes.tarpit = 0.1
            const start = Date.now()
            plugin.tarpit((rc) => {
                assert.equal(rc, undefined)
                assert.ok(Date.now() - start >= 90)
                done()
            }, conn)
        })
    })
})
