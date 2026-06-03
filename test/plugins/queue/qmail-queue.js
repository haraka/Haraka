'use strict'

const assert = require('node:assert')
const { describe, it, beforeEach, before } = require('node:test')

const { makeConnection, makePlugin } = require('haraka-test-fixtures')

before(() => {
    require('haraka-constants').import(global)
})

describe('queue/qmail-queue', () => {
    describe('register', () => {
        it('throws when qmail-queue binary is not found', () => {
            const plugin = makePlugin('queue/qmail-queue', { register: false })
            assert.throws(() => plugin.register(), /Cannot find qmail-queue binary/)
        })
    })

    describe('load_qmail_queue_ini', () => {
        it('loads config with enable_outbound boolean', () => {
            const plugin = makePlugin('queue/qmail-queue', { register: false })
            plugin.load_qmail_queue_ini()
            assert.ok(typeof plugin.cfg.main.enable_outbound === 'boolean')
        })
    })

    describe('hook_queue', () => {
        let plugin, conn

        beforeEach(() => {
            plugin = makePlugin('queue/qmail-queue', { register: false })
            plugin.load_qmail_queue_ini()
            plugin.queue_exec = '/bin/echo' // use a real binary that exists
            conn = makeConnection({ withTxn: true })
        })

        it('calls next() when there is no transaction', (t, done) => {
            const connNoTxn = makeConnection()
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
            plugin = makePlugin('queue/qmail-queue', { register: false })
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
