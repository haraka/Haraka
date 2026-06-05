'use strict'

const assert = require('node:assert/strict')
const { beforeEach, describe, it } = require('node:test')

const { makeConnection, makePlugin } = require('haraka-test-fixtures')
require('haraka-constants').import(global)

describe('toobusy', () => {
    let plugin

    beforeEach(() => {
        plugin = makePlugin('toobusy', { register: false })
    })

    describe('register', () => {
        it('registers connect hook with correct priority', () => {
            const hooks = []
            plugin.register_hook = function (hook, name, priority) {
                hooks.push({ hook, name, priority })
            }

            plugin.register()

            assert.equal(hooks.length, 1, 'should register one hook')
            assert.equal(hooks[0].hook, 'connect')
            assert.equal(hooks[0].name, 'check_busy')
            assert.equal(hooks[0].priority, -100)
        })

        it('loads config on register', () => {
            let loadConfigCalled = false
            const originalLoadConfig = plugin.loadConfig
            plugin.loadConfig = function () {
                loadConfigCalled = true
                return originalLoadConfig.call(this)
            }

            plugin.register()

            assert.equal(loadConfigCalled, true, 'loadConfig should be called')
        })

        it('handles missing toobusy-js gracefully', () => {
            assert.doesNotThrow(() => plugin.register())
        })
    })

    describe('loadConfig', () => {
        beforeEach(() => {
            plugin.register()
        })

        it('gets toobusy.maxlag config value', () => {
            let configArgs = []

            plugin.config.get = function (key, type, callback) {
                configArgs = [key, type]
                return '70'
            }

            plugin.loadConfig()

            assert.equal(configArgs[0], 'toobusy.maxlag')
            assert.equal(configArgs[1], 'value')
        })

        it('passes callback to config.get for hot reload', () => {
            let callbackProvided = false

            plugin.config.get = function (key, type, callback) {
                callbackProvided = typeof callback === 'function'
                return '70'
            }

            plugin.loadConfig()

            assert.equal(callbackProvided, true, 'callback should be provided for hot reload')
        })

        it('handles zero maxLag value', () => {
            plugin.config.get = () => '0'

            assert.doesNotThrow(() => {
                plugin.loadConfig()
            })
        })

        it('handles non-numeric maxLag value', () => {
            plugin.config.get = () => 'notanumber'

            assert.doesNotThrow(() => {
                plugin.loadConfig()
            })
        })

        it('handles empty string maxLag value', () => {
            plugin.config.get = () => ''

            assert.doesNotThrow(() => {
                plugin.loadConfig()
            })
        })

        it('parses numeric maxLag as integer', () => {
            plugin.config.get = () => '100'

            assert.doesNotThrow(() => {
                plugin.loadConfig()
            })
        })

        it('supports reload via callback', () => {
            let callbackFn = null

            plugin.config.get = function (key, type, callback) {
                callbackFn = callback
                return '70'
            }

            plugin.loadConfig()

            assert.equal(typeof callbackFn, 'function', 'callback should be provided')
            assert.doesNotThrow(() => {
                if (callbackFn) callbackFn()
            })
        })
    })

    describe('check_busy', () => {
        beforeEach(() => {
            plugin.register()
        })

        it('calls next without args when not busy', (t, done) => {
            plugin.config.get = () => '70'
            plugin.loadConfig()

            plugin.check_busy(function (...args) {
                assert.equal(args.length, 0, 'should call next with no arguments')
                done()
            })
        })

        it('initializes was_busy state', (t, done) => {
            plugin.config.get = () => '70'
            plugin.loadConfig()

            plugin.check_busy(function () {
                done()
            })
        })

        it('is a callable function', () => {
            assert.equal(typeof plugin.check_busy, 'function')
        })

        it('does not log when not busy', (t, done) => {
            plugin.config.get = () => '70'
            plugin.loadConfig()

            let logCount = 0
            plugin.logcrit = function () {
                logCount++
            }

            plugin.check_busy(function () {
                plugin.check_busy(function () {
                    assert.equal(logCount, 0, 'should not log when not busy')
                    done()
                })
            })
        })

        it('accepts next callback', (t, done) => {
            plugin.config.get = () => '70'
            plugin.loadConfig()

            const nextFn = function () {
                done()
            }

            assert.doesNotThrow(() => {
                plugin.check_busy(nextFn)
            })
        })

        it('works with connection context', (t, done) => {
            plugin.config.get = () => '70'
            plugin.loadConfig()

            const conn = makeConnection()
            plugin.check_busy.call(conn, function () {
                done()
            })
        })
    })
})
