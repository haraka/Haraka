'use strict'
const assert = require('node:assert/strict')
const { describe, it, beforeEach } = require('node:test')

const { Address } = require('address-rfc2821')
const fixtures = require('haraka-test-fixtures')
require('haraka-constants').import(global)

const _set_up = () => {
    this.plugin = new fixtures.plugin('rcpt_to.in_host_list')
    this.plugin.inherits('rcpt_to.host_list_base')
    this.plugin.cfg = {}
    this.plugin.host_list = {}

    this.connection = fixtures.connection.createConnection()
    this.connection.transaction = {
        results: new fixtures.results(this.connection),
        notes: {},
    }
}

describe('in_host_list', () => {
    beforeEach(_set_up)

    it('miss', () => {
        assert.equal(this.plugin.in_host_list('test.com'), false)
    })

    it('hit', () => {
        this.plugin.host_list['test.com'] = true
        assert.equal(this.plugin.in_host_list('test.com'), true)
    })

    describe('in_host_regex', () => {
        beforeEach(_set_up)

        const setRegex = (patterns) => {
            this.plugin.host_list_regex = patterns
            this.plugin.hl_re = new RegExp(`^(?:${patterns.join('|')})$`, 'i')
        }

        it('returns false when hl_re is not set', () => {
            assert.equal(this.plugin.in_host_regex('test.com'), false)
        })

        const cases = [
            { desc: 'miss', patterns: ['miss.com'], domain: 'test.com', expected: false },
            { desc: 'exact hit', patterns: ['test.com'], domain: 'test.com', expected: true },
            { desc: 're hit', patterns: ['.*est.com'], domain: 'test.com', expected: true },
        ]
        for (const { desc, patterns, domain, expected } of cases) {
            it(desc, () => {
                setRegex(patterns)
                assert.equal(this.plugin.in_host_regex(domain), expected)
            })
        }
    })

    describe('hook_mail', () => {
        beforeEach(_set_up)

        const setRegex = (patterns) => {
            this.plugin.host_list_regex = patterns
            this.plugin.hl_re = new RegExp(`^(?:${patterns.join('|')})$`, 'i')
        }

        const callMailHook = (addr) =>
            new Promise((resolve) => {
                this.plugin.hook_mail((rc, msg) => resolve({ rc, msg }), this.connection, [new Address(addr)])
            })

        it('null sender always passes when relaying', async () => {
            this.connection.relaying = true
            const { rc, msg } = await callMailHook('<>')
            assert.equal(rc, undefined)
            assert.equal(msg, undefined)
        })

        it('miss: records mail_from!local in results', async () => {
            this.plugin.host_list = { 'miss.com': true }
            const { rc, msg } = await callMailHook('<user@example.com>')
            assert.equal(rc, undefined)
            assert.equal(msg, undefined)
            const res = this.connection.transaction.results.get('rcpt_to.in_host_list')
            assert.ok(res.msg.includes('mail_from!local'))
        })

        for (const [desc, setup] of [
            [
                'hit',
                () => {
                    this.plugin.host_list = { 'example.com': true }
                },
            ],
            ['hit, regex, exact', () => setRegex(['example.com'])],
            ['hit, regex, pattern', () => setRegex(['.*mple.com'])],
        ]) {
            it(desc, async () => {
                setup()
                const { rc, msg } = await callMailHook('<user@example.com>')
                assert.equal(rc, undefined)
                assert.equal(msg, undefined)
                const res = this.connection.transaction.results.get('rcpt_to.in_host_list')
                assert.ok(res.pass.includes('mail_from'))
            })
        }
    })

    describe('hook_rcpt', () => {
        beforeEach(_set_up)

        const setRegex = (patterns) => {
            this.plugin.host_list_regex = patterns
            this.plugin.hl_re = new RegExp(`^(?:${patterns.join('|')})$`, 'i')
        }

        const callRcptHook = (addr) =>
            new Promise((resolve) => {
                this.plugin.hook_rcpt((rc, msg) => resolve({ rc, msg }), this.connection, [new Address(addr)])
            })

        it('missing txn: does not call next (returns early)', () => {
            // When transaction is missing the plugin returns without calling next()
            delete this.connection.transaction
            let nextCalled = false
            this.plugin.hook_rcpt(
                () => {
                    nextCalled = true
                },
                this.connection,
                [new Address('test@test.com')],
            )
            assert.equal(nextCalled, false)
        })

        const cases = [
            {
                desc: 'hit list',
                setup: () => {
                    this.plugin.host_list = { 'test.com': true }
                },
                addr: 'test@test.com',
                expectedRC: OK,
            },
            {
                desc: 'miss list',
                setup: () => {
                    this.plugin.host_list = { 'miss.com': true }
                },
                addr: 'test@test.com',
                expectedRC: undefined,
            },
            {
                desc: 'hit regex, exact',
                setup: () => setRegex(['test.com']),
                addr: 'test@test.com',
                expectedRC: OK,
            },
            {
                desc: 'hit regex, pattern',
                setup: () => setRegex(['.est.com']),
                addr: 'test@test.com',
                expectedRC: OK,
            },
            {
                desc: 'miss regex, pattern',
                setup: () => setRegex(['a.est.com']),
                addr: 'test@test.com',
                expectedRC: undefined,
            },
            {
                desc: 'rcpt miss, relaying to local sender',
                setup: () => {
                    this.connection.relaying = true
                    this.connection.transaction.notes = { local_sender: true }
                },
                addr: 'test@test.com',
                expectedRC: OK,
            },
        ]

        for (const { desc, setup, addr, expectedRC } of cases) {
            it(desc, async () => {
                setup()
                const { rc, msg } = await callRcptHook(addr)
                assert.equal(rc, expectedRC)
                assert.equal(msg, undefined)
            })
        }
    })
})
