'use strict'

const { describe, it, beforeEach } = require('node:test')
const assert = require('node:assert/strict')
const util = require('node:util')

const _set_up = () => {
    this.logger = require('../logger')
}

describe('logger', () => {
    beforeEach(_set_up)

    describe('init', () => {
        it('logger', () => {
            assert.ok(this.logger)
        })
    })

    describe('log', () => {
        const formats = ['DEFAULT', 'LOGFMT', 'JSON']

        for (const fmt of formats) {
            it(`log in ${fmt} format`, () => {
                this.logger.deferred_logs = []
                this.logger.format = this.logger.formats[fmt]
                assert.ok(this.logger.log('WARN', 'test warning'))
                assert.equal(this.logger.deferred_logs.length, 1)
            })

            it(`log in ${fmt} format w/deferred`, () => {
                this.logger.format = this.logger.formats[fmt]
                this.logger.plugins = { plugin_list: true }
                this.logger.deferred_logs.push({ level: 'INFO', data: 'log test info' })
                assert.ok(this.logger.log('INFO', 'another test info'))
            })
        }
    })

    describe('level', () => {
        it('both INFO and LOGINFO are log levels', () => {
            assert.equal(this.logger.levels.INFO, 6)
            assert.equal(this.logger.levels.LOGINFO, 6)
        })
    })

    describe('set_format', () => {
        // [input, expected format key]
        const cases = [
            ['DEFAULT', 'DEFAULT'],
            ['LOGFMT', 'LOGFMT'],
            ['JSON', 'JSON'],
            ['', 'DEFAULT'], // empty → DEFAULT
            ['default', 'DEFAULT'], // case-insensitive → DEFAULT
            ['invalid', 'DEFAULT'], // unknown → DEFAULT
        ]
        for (const [input, expectedKey] of cases) {
            it(`set_format(${JSON.stringify(input)}) → ${expectedKey}`, () => {
                this.logger.format = ''
                this.logger.set_format(input)
                assert.equal(this.logger.format, this.logger.formats[expectedKey])
            })
        }
    })

    describe('set_loglevel', () => {
        // [input, expected level key or null for numeric assertion]
        const cases = [
            ['LOGINFO', 'LOGINFO'],
            ['INFO', 'INFO'],
            ['emerg', 'EMERG'], // case-insensitive
            [6, null], // numeric passthrough
            ['invalid', 'WARN'], // unknown → WARN
        ]
        for (const [input, expectedKey] of cases) {
            it(`set_loglevel(${JSON.stringify(input)}) → ${expectedKey ?? input}`, () => {
                this.logger.set_loglevel(input)
                const expected = expectedKey ? this.logger.levels[expectedKey] : input
                assert.equal(this.logger.loglevel, expected)
            })
        }
    })

    describe('set_timestamps', () => {
        it('set timestamps to false', () => {
            this.logger.timestamps = undefined
            this.logger.set_timestamps(false)
            assert.equal(this.logger.timestamps, false)
        })

        it('set timestamps to true', () => {
            this.logger.timestamps = undefined
            this.logger.set_timestamps(true)
            assert.equal(this.logger.timestamps, true)
        })
    })

    describe('would_log', () => {
        it('should', () => {
            this.logger.loglevel = 4
            assert.equal(false, this.logger.would_log(7))
            assert.equal(false, this.logger.would_log(6))
            assert.equal(false, this.logger.would_log(5))
        })

        it('should not', () => {
            this.logger.loglevel = 4
            assert.equal(true, this.logger.would_log(4))
            assert.equal(true, this.logger.would_log(3))
            assert.equal(true, this.logger.would_log(2))
            assert.equal(true, this.logger.would_log(1))
        })
    })

    describe('log_respond', () => {
        it('invalid retval', () => {
            assert.equal(false, this.logger.log_respond(901))
        })

        it('valid retval', () => {
            const data = { level: 'INFO', data: 'test data' }
            assert.equal(true, this.logger.log_respond(900, 'test msg', data))
        })
    })

    describe('dump_logs', () => {
        it('empty', () => {
            assert.ok(this.logger.dump_logs(0))
        })

        it('with deferred', () => {
            this.logger.deferred_logs.push({
                level: 'info',
                data: 'test info',
            })
            this.logger.deferred_logs.push({
                level: 'INFO',
                data: 'test info, color',
            })
            this.logger.deferred_logs.push({
                level: 'WARN',
                data: 'test warn, color',
            })
            assert.ok(this.logger.dump_logs(0))
            assert.ok(this.logger.deferred_logs.length === 0)
        })
    })

    describe('colors', () => {
        it('colors', () => {
            assert.ok(this.logger.colors)
        })

        it('colorize', () => {
            assert.ok(this.logger.colorize)
            assert.equal('function', typeof this.logger.colorize)
            assert.equal('error', this.logger.colorize('bad-color', 'error'))
            const expected = util.inspect.colors ? '\u001b[34mgood\u001b[39m' : 'good'
            assert.equal(expected, this.logger.colorize('blue', 'good'))
        })
    })

    describe('log_if_level', () => {
        it('is a function', () => {
            assert.equal(typeof this.logger.log_if_level, 'function')
        })

        it('returns a logging function', () => {
            this.logger.loglevel = 9
            const f = this.logger.log_if_level('INFO', 'LOGINFO')
            assert.equal(typeof f, 'function')
        })

        // Each of these runs independently with a fresh deferred_logs
        for (const [label, msg] of [
            ['string', 'test info message'],
            ['null', null],
            ['false', false],
            ['0 (falsy number)', 0],
        ]) {
            it(`logs ${label} value and appends to deferred_logs`, () => {
                this.logger.loglevel = 9
                this.logger.deferred_logs = []
                const f = this.logger.log_if_level('INFO', 'LOGINFO')
                assert.ok(f(msg))
                assert.equal(this.logger.deferred_logs.length, 1)
            })
        }

        it('records correct level in deferred log entry', () => {
            this.logger.loglevel = 9
            this.logger.deferred_logs = []
            const f = this.logger.log_if_level('INFO', 'LOGINFO')
            f('test info message')
            assert.equal(this.logger.deferred_logs[0].level, 'INFO')
        })
    })

    describe('CR/LF neutralization', () => {
        const capture = (fmt, ...args) => {
            const lines = []
            const orig_log = this.logger.log
            const orig_format = this.logger.format
            this.logger.format = this.logger.formats[fmt]
            this.logger.log = (level, msg) => {
                lines.push(msg)
                return true
            }
            try {
                this.logger.lognotice(...args)
            } finally {
                this.logger.log = orig_log
                this.logger.format = orig_format
            }
            return lines
        }

        const forged = 'mid\n[NOTICE] [-] [core] forged'

        for (const fmt of ['DEFAULT', 'LOGFMT', 'JSON']) {
            it(`${fmt} emits one physical line for an object value`, () => {
                const [line] = capture(fmt, 'message', { mid: forged })
                assert.equal(line.split('\n').length, 1)
                assert.match(line, /forged/)
            })

            it(`${fmt} emits one physical line for a string argument`, () => {
                const [line] = capture(fmt, `C: ${forged}`)
                assert.equal(line.split('\n').length, 1)
            })

            it(`${fmt} keeps a literal backslash sequence distinct from a line break`, () => {
                const [literal] = capture(fmt, 'C: a\\nb')
                const [line_break] = capture(fmt, 'C: a\nb')
                assert.notEqual(literal, line_break)
            })

            it(`${fmt} escapes a bare CR`, () => {
                const [line] = capture(fmt, 'message', { mid: 'a\rb' })
                assert.ok(!line.includes('\r'))
            })
        }
    })

    describe('Error arguments', () => {
        const capture = (fmt, ...args) => {
            const records = []
            const orig_log = this.logger.log
            const orig_format = this.logger.format
            this.logger.format = this.logger.formats[fmt]
            this.logger.log = (level, msg) => {
                records.push(msg)
                return true
            }
            try {
                this.logger.logcrit(...args)
            } finally {
                this.logger.log = orig_log
                this.logger.format = orig_format
            }
            return records
        }

        const err = () => {
            const e = new Error('boom')
            e.stack = ['Error: boom', '    at one (a.js:1:1)', '    at two (b.js:2:2)'].join('\n')
            return e
        }

        for (const fmt of ['DEFAULT', 'LOGFMT']) {
            it(`${fmt} emits one record per stack frame`, () => {
                const records = capture(fmt, err())
                assert.equal(records.length, 3)
                assert.match(records[0], /Error: boom/)
                assert.match(records[1], /at one \(a\.js:1:1\)/)
                assert.match(records[2], /at two \(b\.js:2:2\)/)
            })

            it(`${fmt} keeps every record on one physical line`, () => {
                for (const record of capture(fmt, err())) {
                    assert.equal(record.split('\n').length, 1)
                }
            })

            it(`${fmt} keeps the level, uuid and origin on every frame`, () => {
                const records = capture(fmt, err())
                assert.match(records[2], /CRIT/)
                assert.match(records[2], /core/)
            })

            it(`${fmt} joins a leading message to the error summary`, () => {
                assert.match(capture(fmt, 'hook failed:', err())[0], /hook failed: Error: boom/)
            })

            it(`${fmt} says nothing extra for a bare stack-capture Error`, () => {
                const bare = new Error()
                bare.stack = ['Error', '    at one (a.js:1:1)'].join('\n')
                const records = capture(fmt, 'ran callback twice', bare)
                assert.match(records[0], /ran callback twice/)
                assert.ok(!/twice\s*Error/.test(records[0]), 'no empty "Error" tacked on')
                assert.equal(records.length, 2)
            })
        }

        it('JSON keeps the whole stack inside one record', () => {
            const records = capture('JSON', err())
            assert.equal(records.length, 1)
            const parsed = JSON.parse(records[0])
            assert.equal(parsed.message, 'Error: boom\n    at one (a.js:1:1)\n    at two (b.js:2:2)')
        })

        it('a non-Error argument is unaffected', () => {
            assert.equal(capture('DEFAULT', 'plain message').length, 1)
            assert.equal(capture('DEFAULT', 'with obj', { a: 1 }).length, 1)
        })
    })

    describe('add_log_methods', () => {
        it('ignores non-objects', () => {
            assert.equal(undefined, this.logger.add_log_methods(''))
            assert.equal(
                undefined,
                this.logger.add_log_methods(function foo() {}),
            )
        })

        it('adds functions to an object', () => {
            const testObj = {}
            this.logger.add_log_methods(testObj)
            const levels = ['DATA', 'PROTOCOL', 'DEBUG', 'INFO', 'NOTICE', 'WARN', 'ERROR', 'CRIT', 'ALERT', 'EMERG']
            for (const level of levels) {
                assert.ok('function' === typeof testObj[`log${level.toLowerCase()}`])
            }
        })
    })
})
