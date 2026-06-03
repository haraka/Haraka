'use strict'

const assert = require('node:assert')
const { describe, it, beforeEach, before } = require('node:test')

const { makeConnection, makePlugin } = require('haraka-test-fixtures')

before(() => {
    require('haraka-constants').import(global)
})

describe('queue/discard', () => {
    describe('discard hook', () => {
        let plugin, conn

        beforeEach(() => {
            plugin = makePlugin('queue/discard')
            conn = makeConnection({ withTxn: true })
            delete process.env.YES_REALLY_DO_DISCARD
        })

        it('calls next() when queue.wants is set to another plugin', (t, done) => {
            conn.transaction.notes.set('queue.wants', 'smtp_forward')
            plugin.discard((rc) => {
                assert.equal(rc, undefined)
                done()
            }, conn)
        })

        it('calls next(OK) when connection.notes.discard is set', (t, done) => {
            conn.notes.discard = true
            plugin.discard((rc) => {
                assert.equal(rc, OK)
                done()
            }, conn)
        })

        it('calls next(OK) when txn.notes.discard is set', (t, done) => {
            conn.transaction.notes.discard = true
            plugin.discard((rc) => {
                assert.equal(rc, OK)
                done()
            }, conn)
        })

        it('calls next(OK) when queue.wants is discard', (t, done) => {
            conn.transaction.notes.set('queue.wants', 'discard')
            plugin.discard((rc) => {
                assert.equal(rc, OK)
                done()
            }, conn)
        })

        it('calls next(OK) when YES_REALLY_DO_DISCARD env var is set', (t, done) => {
            process.env.YES_REALLY_DO_DISCARD = '1'
            plugin.discard((rc) => {
                assert.equal(rc, OK)
                done()
            }, conn)
        })

        it('calls next() (pass-through) when no discard conditions are met', (t, done) => {
            plugin.discard((rc) => {
                assert.equal(rc, undefined)
                done()
            }, conn)
        })

        it('queue.wants=discard takes priority over other queue wants', (t, done) => {
            // Once queue.wants is set, it's compared against 'discard'; since it equals 'discard', discard runs
            conn.transaction.notes.set('queue.wants', 'discard')
            plugin.discard((rc) => {
                assert.equal(rc, OK)
                done()
            }, conn)
        })
    })
})
