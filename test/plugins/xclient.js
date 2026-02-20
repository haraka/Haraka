'use strict'

const assert = require('node:assert')

const fixtures = require('haraka-test-fixtures')

const _set_up = (done) => {
    this.plugin = new fixtures.plugin('xclient')
    this.connection = fixtures.connection.createConnection()
    this.connection.capabilities = []
    done()
}

describe('xclient', () => {
    beforeEach(_set_up)

    describe('hook_capabilities', () => {
        it('adds XCLIENT capability for allowed IP (127.0.0.1)', (done) => {
            this.connection.remote.ip = '127.0.0.1'
            this.plugin.hook_capabilities(
                () => {
                    assert.ok(
                        this.connection.capabilities.some((c) => c.startsWith('XCLIENT')),
                        'XCLIENT capability added',
                    )
                    done()
                },
                this.connection,
            )
        })

        it('adds XCLIENT capability for allowed IP (::1)', (done) => {
            this.connection.remote.ip = '::1'
            this.plugin.hook_capabilities(
                () => {
                    assert.ok(
                        this.connection.capabilities.some((c) => c.startsWith('XCLIENT')),
                        'XCLIENT capability added for IPv6 loopback',
                    )
                    done()
                },
                this.connection,
            )
        })

        it('does not add XCLIENT capability for disallowed IP', (done) => {
            this.connection.remote.ip = '10.0.0.1'
            this.plugin.hook_capabilities(
                () => {
                    assert.ok(
                        !this.connection.capabilities.some((c) => c.startsWith('XCLIENT')),
                        'XCLIENT capability not added',
                    )
                    done()
                },
                this.connection,
            )
        })
    })

    describe('hook_unrecognized_command', () => {
        it('ignores non-XCLIENT commands', (done) => {
            this.plugin.hook_unrecognized_command(
                (code) => {
                    assert.equal(code, undefined, 'next called with no args')
                    done()
                },
                this.connection,
                ['EHLO', 'example.com'],
            )
        })

        it('denies XCLIENT when transaction is in progress', (done) => {
            this.connection.init_transaction()
            this.plugin.hook_unrecognized_command(
                (code) => {
                    assert.equal(code, DENY, 'denied with transaction in progress')
                    done()
                },
                this.connection,
                ['XCLIENT', 'ADDR=127.0.0.1'],
            )
        })

        it('denies XCLIENT from disallowed IP', (done) => {
            this.connection.remote.ip = '10.0.0.1'
            this.plugin.hook_unrecognized_command(
                (code) => {
                    assert.equal(code, DENY, 'denied from non-allowed IP')
                    done()
                },
                this.connection,
                ['XCLIENT', 'ADDR=127.0.0.2'],
            )
        })

        it('denies XCLIENT with no valid IP address', (done) => {
            this.connection.remote.ip = '127.0.0.1'
            this.plugin.hook_unrecognized_command(
                (code) => {
                    assert.equal(code, DENY, 'denied when no valid ADDR')
                    done()
                },
                this.connection,
                ['XCLIENT', 'NAME=example.com'],
            )
        })

        it('accepts XCLIENT with valid IPv4 ADDR from allowed host', (done) => {
            this.connection.remote.ip = '127.0.0.1'
            this.plugin.hook_unrecognized_command(
                (code) => {
                    // NEXT_HOOK or undefined (next called) means accepted
                    assert.ok(code === NEXT_HOOK || code === undefined, 'accepted valid XCLIENT')
                    done()
                },
                this.connection,
                ['XCLIENT', 'ADDR=1.2.3.4'],
            )
        })

        it('accepts XCLIENT with valid IPv6 ADDR from allowed host', (done) => {
            this.connection.remote.ip = '127.0.0.1'
            this.plugin.hook_unrecognized_command(
                (code) => {
                    assert.ok(code === NEXT_HOOK || code === undefined, 'accepted valid IPv6 XCLIENT')
                    done()
                },
                this.connection,
                ['XCLIENT', 'ADDR=IPV6:2001:db8::1'],
            )
        })

        it('accepts XCLIENT with ADDR and NAME, skipping rdns lookup', (done) => {
            this.connection.remote.ip = '127.0.0.1'
            this.plugin.hook_unrecognized_command(
                (code) => {
                    assert.equal(code, NEXT_HOOK, 'jumps to connect hook when NAME provided')
                    done()
                },
                this.connection,
                ['XCLIENT', 'ADDR=1.2.3.4 NAME=example.com'],
            )
        })
    })
})
