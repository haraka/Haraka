'use strict'

const assert = require('node:assert')
const { describe, it, beforeEach, before } = require('node:test')

const fixtures = require('haraka-test-fixtures')

before(() => {
    require('haraka-constants').import(global)
})

describe('queue/qmail-queue', () => {
    describe('register', () => {
        it('throws when qmail-queue binary is not found', () => {
            const plugin = new fixtures.plugin('queue/qmail-queue')
            assert.throws(() => plugin.register(), /Cannot find qmail-queue binary/)
        })
    })

    describe('load_qmail_queue_ini', () => {
        it('loads config with enable_outbound boolean', () => {
            const plugin = new fixtures.plugin('queue/qmail-queue')
            plugin.load_qmail_queue_ini()
            assert.ok(typeof plugin.cfg.main.enable_outbound === 'boolean')
        })
    })

    describe('hook_queue', () => {
        let plugin, conn

        beforeEach(() => {
            plugin = new fixtures.plugin('queue/qmail-queue')
            plugin.load_qmail_queue_ini()
            plugin.queue_exec = '/bin/echo' // use a real binary that exists
            conn = fixtures.connection.createConnection()
            conn.init_transaction()
        })

        it('calls next() when there is no transaction', (t, done) => {
            const connNoTxn = fixtures.connection.createConnection()
            plugin.hook_queue((rc) => {
                assert.equal(rc, undefined)
                done()
            }, connNoTxn)
        })

        it('calls next() when queue.wants is set to another plugin', (t, done) => {
            conn.transaction.notes.set('queue.wants', 'smtp_forward')
            plugin.hook_queue((rc) => {
                assert.equal(rc, undefined)
                done()
            }, conn)
        })

        it('calls next() when queue.wants is set to discard', (t, done) => {
            conn.transaction.notes.set('queue.wants', 'discard')
            plugin.hook_queue((rc) => {
                assert.equal(rc, undefined)
                done()
            }, conn)
        })
    })
})
