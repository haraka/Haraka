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

    describe('build_envelope', () => {
        let plugin
        beforeEach(() => {
            plugin = new fixtures.plugin('queue/qmail-queue')
        })

        it('formats F<sender>\\0(T<rcpt>\\0)*\\0 with no padding', () => {
            const buf = plugin.build_envelope({
                mail_from: { address: 'snd@example.com' },
                rcpt_to: [{ address: 'a@example.com' }, { address: 'b@example.com' }],
            })
            assert.deepEqual(buf, Buffer.from('Fsnd@example.com\x00Ta@example.com\x00Tb@example.com\x00\x00', 'utf8'))
        })

        it('is not truncated for large recipient sets', () => {
            const rcpt_to = []
            for (let i = 0; i < 500; i++) {
                rcpt_to.push({ address: `recipient-with-a-fairly-long-localpart-${i}@example.com` })
            }
            const buf = plugin.build_envelope({ mail_from: { address: 'snd@example.com' }, rcpt_to })
            assert.equal((buf.toString('utf8').match(/T/g) || []).length, 500)
            assert.ok(buf.length > 4096, 'exceeds the old fixed 4096-byte cap')
            assert.ok(buf.toString('utf8').includes('recipient-with-a-fairly-long-localpart-499@example.com'))
            assert.equal(buf[buf.length - 1], 0)
        })

        it('encodes non-ASCII (SMTPUTF8) addresses correctly', () => {
            const buf = plugin.build_envelope({
                mail_from: { address: 'sénder@exämple.com' },
                rcpt_to: [{ address: 'reçìpient@exämple.com' }],
            })
            assert.ok(buf.includes(Buffer.from('sénder@exämple.com', 'utf8')))
            assert.ok(buf.includes(Buffer.from('reçìpient@exämple.com', 'utf8')))
        })
    })
})
