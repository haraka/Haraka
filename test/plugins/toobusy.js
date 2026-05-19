'use strict'

const assert = require('node:assert/strict')
const { describe, it } = require('node:test')

const fixtures = require('haraka-test-fixtures')

describe('toobusy', () => {
    describe('register', () => {
        it('handles missing toobusy-js gracefully (does not throw)', () => {
            const plugin = new fixtures.plugin('toobusy')
            // toobusy-js is not installed; register should catch the error and return
            let registered = false
            plugin.register_hook = () => {
                registered = true
            }
            assert.doesNotThrow(() => plugin.register())
            assert.equal(registered, false, 'hook should not be registered without toobusy-js')
        })
    })
})
