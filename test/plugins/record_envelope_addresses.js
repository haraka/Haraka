'use strict'

const assert = require('node:assert')

const { Address } = require('address-rfc2821')
const fixtures = require('haraka-test-fixtures')

const _set_up = (done) => {
    this.plugin = new fixtures.plugin('record_envelope_addresses')
    this.connection = fixtures.connection.createConnection()
    this.connection.init_transaction()
    done()
}

describe('record_envelope_addresses', () => {
    beforeEach(_set_up)

    describe('hook_mail', () => {
        it('adds X-Envelope-From header from MAIL FROM address', (done) => {
            const addr = new Address('<sender@example.com>')
            this.plugin.hook_mail(
                () => {
                    const vals = this.connection.transaction.header.get_all('X-Envelope-From')
                    assert.equal(vals.length, 1, 'header was added')
                    assert.equal(vals[0], 'sender@example.com')
                    done()
                },
                this.connection,
                [addr],
            )
        })

        it('does not throw when connection has no transaction', (done) => {
            this.connection.transaction = null
            const addr = new Address('<sender@example.com>')
            this.plugin.hook_mail(
                () => {
                    assert.ok(true, 'next was called without error')
                    done()
                },
                this.connection,
                [addr],
            )
        })
    })

    describe('hook_rcpt', () => {
        it('adds X-Envelope-To header from RCPT TO address', (done) => {
            const addr = new Address('<rcpt@example.com>')
            this.plugin.hook_rcpt(
                () => {
                    const vals = this.connection.transaction.header.get_all('X-Envelope-To')
                    assert.equal(vals.length, 1, 'header was added')
                    assert.equal(vals[0], 'rcpt@example.com')
                    done()
                },
                this.connection,
                [addr],
            )
        })

        it('adds X-Envelope-To header for each recipient', (done) => {
            const addr1 = new Address('<one@example.com>')
            const addr2 = new Address('<two@example.com>')
            let calls = 0
            const next = () => {
                calls++
                if (calls === 2) {
                    const vals = this.connection.transaction.header.get_all('X-Envelope-To')
                    assert.equal(vals.length, 2, 'two headers added')
                    assert.equal(vals[0], 'one@example.com')
                    assert.equal(vals[1], 'two@example.com')
                    done()
                }
            }
            this.plugin.hook_rcpt(next, this.connection, [addr1])
            this.plugin.hook_rcpt(next, this.connection, [addr2])
        })

        it('does not throw when connection has no transaction', (done) => {
            this.connection.transaction = null
            const addr = new Address('<rcpt@example.com>')
            this.plugin.hook_rcpt(
                () => {
                    assert.ok(true, 'next was called without error')
                    done()
                },
                this.connection,
                [addr],
            )
        })
    })
})
