'use strict'

const assert = require('node:assert')
const { describe, it, beforeEach } = require('node:test')

const { callMail, callRcpt, makeConnection, makePlugin } = require('haraka-test-fixtures')

const _set_up = () => {
    this.plugin = makePlugin('record_envelope_addresses')
    this.connection = makeConnection({ withTxn: true })
}

describe('record_envelope_addresses', () => {
    beforeEach(_set_up)

    describe('hook_mail', () => {
        it('adds X-Envelope-From header from MAIL FROM address', (t, done) => {
            callMail(this.plugin, this.connection, 'sender@example.com').then(() => {
                const vals = this.connection.transaction.header.get_all('X-Envelope-From')
                assert.equal(vals.length, 1, 'header was added')
                assert.equal(vals[0], 'sender@example.com')
                done()
            })
        })

        it('does not throw when connection has no transaction', (t, done) => {
            this.connection.transaction = null
            callMail(this.plugin, this.connection, 'sender@example.com').then(() => {
                assert.ok(true, 'next was called without error')
                done()
            })
        })
    })

    describe('hook_rcpt', () => {
        it('adds X-Envelope-To header from RCPT TO address', (t, done) => {
            callRcpt(this.plugin, this.connection, 'rcpt@example.com').then(() => {
                const vals = this.connection.transaction.header.get_all('X-Envelope-To')
                assert.equal(vals.length, 1, 'header was added')
                assert.equal(vals[0], 'rcpt@example.com')
                done()
            })
        })

        it('adds X-Envelope-To header for each recipient', (t, done) => {
            Promise.all([
                callRcpt(this.plugin, this.connection, 'one@example.com'),
                callRcpt(this.plugin, this.connection, 'two@example.com'),
            ]).then(() => {
                const vals = this.connection.transaction.header.get_all('X-Envelope-To')
                assert.equal(vals.length, 2, 'two headers added')
                assert.equal(vals[0], 'one@example.com')
                assert.equal(vals[1], 'two@example.com')
                done()
            })
        })

        it('does not throw when connection has no transaction', (t, done) => {
            this.connection.transaction = null
            callRcpt(this.plugin, this.connection, 'rcpt@example.com').then(() => {
                assert.ok(true, 'next was called without error')
                done()
            })
        })
    })
})
