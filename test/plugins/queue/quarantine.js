'use strict'

const assert = require('node:assert')
const { describe, it, beforeEach } = require('node:test')

const { makeConnection, makePlugin } = require('haraka-test-fixtures')

describe('queue/quarantine', () => {
    let plugin

    beforeEach(() => {
        plugin = makePlugin('queue/quarantine', { register: false })
        plugin.load_quarantine_ini()
    })

    describe('zeroPad', () => {
        it('pads a single digit number to 2 digits', () => {
            assert.equal(plugin.zeroPad(5, 2), '05')
        })

        it('pads a single digit to 4 digits', () => {
            assert.equal(plugin.zeroPad(7, 4), '0007')
        })

        it('does not pad when already at target length', () => {
            assert.equal(plugin.zeroPad(12, 2), '12')
        })

        it('does not pad when number exceeds target length', () => {
            assert.equal(plugin.zeroPad(2025, 2), '2025')
        })

        it('handles 0 correctly', () => {
            assert.equal(plugin.zeroPad(0, 2), '00')
        })
    })

    describe('get_base_dir', () => {
        it('returns default quarantine path when not configured', () => {
            plugin.cfg = { main: {} }
            assert.equal(plugin.get_base_dir(), '/var/spool/haraka/quarantine')
        })

        it('returns configured quarantine_path when set', () => {
            plugin.cfg = { main: { quarantine_path: '/tmp/my-quarantine' } }
            assert.equal(plugin.get_base_dir(), '/tmp/my-quarantine')
        })
    })

    describe('quarantine hook', () => {
        let conn

        beforeEach(() => {
            conn = makeConnection({ withTxn: true })
        })

        it('calls next() when no quarantine conditions are met', (t, done) => {
            plugin.quarantine((rc) => {
                assert.equal(rc, undefined)
                done()
            }, conn)
        })

        it('calls next() when connection.notes.quarantine is falsy', (t, done) => {
            conn.notes.quarantine = false
            plugin.quarantine((rc) => {
                assert.equal(rc, undefined)
                done()
            }, conn)
        })

        it('calls next() when queue.wants is set to something other than quarantine', (t, done) => {
            conn.transaction.notes.set('queue.wants', 'smtp_forward')
            plugin.quarantine((rc) => {
                assert.equal(rc, undefined)
                done()
            }, conn)
        })
    })
})
