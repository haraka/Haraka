'use strict'

process.env.WITHOUT_CONFIG_CACHE = true

const { describe, it, beforeEach, afterEach } = require('node:test')
const assert = require('node:assert/strict')

const constants = require('haraka-constants')
const logger = require('../logger')
const plugins = require('../plugins')

// base64 of a password, as an AUTH LOGIN client sends it
const SECRET = 'cGFzc3dvcmQxMjM='

function fakeConnection(notes = {}) {
    const lines = []
    const conn = {
        notes,
        hooks_to_run: [],
        lines,
        logdebug() {},
        loginfo: (data) => lines.push(data),
        logerror() {},
        logcrit() {},
        unrecognized_command_respond() {},
    }
    return conn
}

describe('plugins: params in the hook log', () => {
    let saved_hooks, saved_plugins, saved_level

    beforeEach(() => {
        saved_hooks = plugins.registered_hooks
        saved_plugins = plugins.registered_plugins
        saved_level = logger.loglevel
        logger.loglevel = logger.levels.INFO

        plugins.registered_plugins = {
            auth_test: {
                name: 'auth_test',
                timeout: 5,
                hook_unrecognized_command(next) {
                    // as auth_base does: the exchange is over before the callback
                    this.connection_notes.authenticating = false
                    next(constants.ok)
                },
            },
        }
        plugins.registered_hooks = {
            unrecognized_command: [{ plugin: 'auth_test', method: 'hook_unrecognized_command' }],
        }
    })

    afterEach(() => {
        plugins.registered_hooks = saved_hooks
        plugins.registered_plugins = saved_plugins
        logger.loglevel = saved_level
    })

    function run(notes, params) {
        const conn = fakeConnection(notes)
        plugins.registered_plugins.auth_test.connection_notes = notes
        plugins.run_hooks('unrecognized_command', conn, params)
        return conn.lines
    }

    it('does not log the line that answers an AUTH challenge', () => {
        const lines = run({ authenticating: true }, [SECRET])
        assert.equal(lines.length, 1)
        assert.equal(lines[0].hook, 'unrecognized_command')
        assert.notEqual(lines[0].params, SECRET)
        assert.ok(!JSON.stringify(lines).includes(SECRET))
    })

    it('does not log it when the exchange ends in the same hook', () => {
        // authenticating is already false when the result is logged
        const notes = { authenticating: true }
        const lines = run(notes, [SECRET])
        assert.equal(notes.authenticating, false)
        assert.ok(!JSON.stringify(lines).includes(SECRET))
    })

    it('still logs the command of an ordinary unrecognized_command', () => {
        const lines = run({}, ['XYZZY'])
        assert.equal(lines[0].params, 'XYZZY')
    })

    it('still logs the AUTH command line, which carries no secret', () => {
        const lines = run({ authenticating: false }, ['AUTH', 'LOGIN'])
        assert.equal(lines[0].params, 'AUTH')
    })
})
