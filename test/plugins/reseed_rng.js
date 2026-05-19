'use strict'

const assert = require('node:assert/strict')
const { describe, it } = require('node:test')

const fixtures = require('haraka-test-fixtures')

describe('reseed_rng', () => {
    describe('hook_init_child', () => {
        it('calls Math.seedrandom with a hex string and calls next', (t, done) => {
            const plugin = new fixtures.plugin('reseed_rng')
            let called = false
            let calledArg
            Math.seedrandom = (arg) => {
                called = true
                calledArg = arg
            }
            plugin.hook_init_child((rc) => {
                delete Math.seedrandom
                assert.equal(rc, undefined)
                assert.ok(called, 'Math.seedrandom should have been called')
                assert.equal(typeof calledArg, 'string')
                assert.ok(calledArg.length > 0)
                done()
            })
        })

        it('throws when Math.seedrandom is not defined', () => {
            const plugin = new fixtures.plugin('reseed_rng')
            delete Math.seedrandom
            assert.throws(() => plugin.hook_init_child(() => {}), /Math\.seedrandom is not a function/)
        })
    })
})
