'use strict'

const assert = require('node:assert/strict')
const { describe, it, beforeEach } = require('node:test')

const fixtures = require('haraka-test-fixtures')

const _set_up = () => {
    this.plugin = new fixtures.plugin('xclient')
    this.connection = fixtures.connection.createConnection()
    this.connection.capabilities = []
}

describe('xclient', () => {
    beforeEach(_set_up)

    describe('hook_capabilities', () => {
        const cases = [
            { desc: 'adds XCLIENT for loopback IPv4 (127.0.0.1)', ip: '127.0.0.1', expected: true },
            { desc: 'adds XCLIENT for loopback IPv6 (::1)', ip: '::1', expected: true },
            { desc: 'does not add XCLIENT for non-loopback IP', ip: '10.0.0.1', expected: false },
        ]

        for (const { desc, ip, expected } of cases) {
            it(desc, async () => {
                this.connection.remote.ip = ip
                await new Promise((resolve) => this.plugin.hook_capabilities(resolve, this.connection))
                const hasXclient = this.connection.capabilities.some((c) => c.startsWith('XCLIENT'))
                assert.equal(hasXclient, expected)
            })
        }
    })

    describe('hook_unrecognized_command', () => {
        const callHook = (params) =>
            new Promise((resolve) => {
                this.plugin.hook_unrecognized_command((code) => resolve(code), this.connection, params)
            })

        const cases = [
            {
                desc: 'ignores non-XCLIENT commands',
                params: ['EHLO', 'example.com'],
                check: (code) => assert.equal(code, undefined),
            },
            {
                desc: 'denies XCLIENT when transaction is in progress',
                setup: () => this.connection.init_transaction(),
                params: ['XCLIENT', 'ADDR=127.0.0.1'],
                check: (code) => assert.equal(code, DENY),
            },
            {
                desc: 'denies XCLIENT from disallowed IP',
                setup: () => {
                    this.connection.remote.ip = '10.0.0.1'
                },
                params: ['XCLIENT', 'ADDR=127.0.0.2'],
                check: (code) => assert.equal(code, DENY),
            },
            {
                desc: 'denies XCLIENT with no valid IP address',
                setup: () => {
                    this.connection.remote.ip = '127.0.0.1'
                },
                params: ['XCLIENT', 'NAME=example.com'],
                check: (code) => assert.equal(code, DENY),
            },
            {
                desc: 'accepts XCLIENT with valid IPv4 ADDR from allowed host',
                setup: () => {
                    this.connection.remote.ip = '127.0.0.1'
                },
                params: ['XCLIENT', 'ADDR=1.2.3.4'],
                check: (code) => assert.ok(code === NEXT_HOOK || code === undefined),
            },
            {
                desc: 'accepts XCLIENT with valid IPv6 ADDR from allowed host',
                setup: () => {
                    this.connection.remote.ip = '127.0.0.1'
                },
                params: ['XCLIENT', 'ADDR=IPV6:2001:db8::1'],
                check: (code) => assert.ok(code === NEXT_HOOK || code === undefined),
            },
            {
                desc: 'accepts XCLIENT with ADDR and NAME, skipping rdns lookup',
                setup: () => {
                    this.connection.remote.ip = '127.0.0.1'
                },
                params: ['XCLIENT', 'ADDR=1.2.3.4 NAME=example.com'],
                check: (code) => assert.equal(code, NEXT_HOOK),
            },
        ]

        for (const { desc, setup, params, check } of cases) {
            it(desc, async () => {
                if (setup) setup()
                const code = await callHook(params)
                check(code)
            })
        }
    })
})
