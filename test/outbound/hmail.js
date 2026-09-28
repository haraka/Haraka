'use strict'

const { describe, it, before, beforeEach, afterEach } = require('node:test')
const assert = require('node:assert')
const { EventEmitter } = require('node:events')
const fs = require('node:fs')
const path = require('node:path')

// Load outbound/index FIRST to avoid the circular-dependency boot-order issue.
const outbound = require('../../outbound')
const Hmail = outbound.HMailItem
const client_pool = require('../../outbound/client_pool')
const constants = require('haraka-constants')
const net_utils = require('haraka-net-utils')
const obc = require('../../outbound/config')

// ── Helpers ───────────────────────────────────────────────────────────────────

const onEvent = (emitter, event) => new Promise((resolve) => emitter.once(event, resolve))

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('outbound/hmail', () => {
    let hmail

    beforeEach(() => {
        hmail = new Hmail(
            '1508455115683_1508455115683_0_90253_9Q4o4V_1_haraka',
            'test/queue/1508455115683_1508455115683_0_90253_9Q4o4V_1_haraka',
            {},
        )
    })

    describe('socket error/timeout handler robustness (#3388)', () => {
        const mx = { using_lmtp: false, port: 25, exchange: 'mx.example.com', bind: null, bind_helo: 'test' }
        let origRelease

        function makeSocket() {
            const s = new EventEmitter()
            s.name = 'mock'
            s.writable = true
            s.write = () => {}
            s.destroy = () => {}
            return s
        }

        beforeEach(() => {
            origRelease = client_pool.release_client
            client_pool.release_client = () => {}
            hmail.todo = { rcpt_to: [] }
            hmail.try_deliver = () => {}
            hmail.logerror = () => {}
        })

        afterEach(() => {
            client_pool.release_client = origRelease
        })

        it('error then timeout does not throw ERR_UNHANDLED_ERROR', () => {
            const socket = makeSocket()
            hmail.try_deliver_host_on_socket(mx, '1.2.3.4', 25, socket)
            socket.emit('error', new Error('connection refused'))
            assert.doesNotThrow(() => socket.emit('timeout'), 'timeout after error must not crash')
        })

        it('timeout then error does not throw ERR_UNHANDLED_ERROR', () => {
            const socket = makeSocket()
            hmail.try_deliver_host_on_socket(mx, '1.2.3.4', 25, socket)
            socket.emit('timeout')
            assert.doesNotThrow(
                () => socket.emit('error', new Error('late error')),
                'error after timeout must not crash',
            )
        })

        it('multiple timeouts do not throw ERR_UNHANDLED_ERROR', () => {
            const socket = makeSocket()
            hmail.try_deliver_host_on_socket(mx, '1.2.3.4', 25, socket)
            socket.emit('timeout')
            assert.doesNotThrow(() => socket.emit('timeout'), 'second timeout must not crash')
        })

        it('records socket error, timeout, and close in mx_errors', () => {
            for (const event of ['error', 'timeout', 'close']) {
                const socket = makeSocket()
                hmail.try_deliver_host_on_socket(mx, '1.2.3.4', 25, socket)
                socket.emit(event, event === 'error' ? new Error('boom') : undefined)
                socket.emit('close')
            }
            assert.deepEqual(hmail.mx_errors, [
                '1.2.3.4:25 Error: boom',
                '1.2.3.4:25 socket timeout waiting on connect',
                '1.2.3.4:25 closed connection',
            ])
        })

        it('records an unwritable socket in mx_errors', () => {
            const socket = makeSocket()
            hmail.try_deliver_host_on_socket(mx, '1.2.3.4', 25, socket)
            socket.writable = false
            socket.send_command('EHLO', 'test')
            assert.deepEqual(hmail.mx_errors, ['1.2.3.4:25 socket not writable'])
        })
    })

    describe('Tried all MXs', () => {
        let origGetClient
        let origLocalMxOk
        let origIsLocalHost
        let deferred
        let warned

        // hmail.js binds its queue globals on setImmediate
        before(() => new Promise(setImmediate))

        beforeEach(() => {
            origGetClient = client_pool.get_client
            origLocalMxOk = obc.cfg.local_mx_ok
            origIsLocalHost = net_utils.is_local_host
            deferred = null
            warned = null
            hmail.todo = { domain: 'example.com', notes: {}, rcpt_to: [{ original: 'u@example.com' }] }
            hmail.logerror = () => {}
            hmail.loginfo = () => {}
            hmail.logwarn = (m) => {
                warned = m
            }
            hmail.temp_fail = (err, extra) => {
                deferred = { err, mx_errors: extra.mx_errors }
            }
        })

        afterEach(() => {
            client_pool.get_client = origGetClient
            obc.cfg.local_mx_ok = origLocalMxOk
            net_utils.is_local_host = origIsLocalHost
        })

        it('passes per-MX failures to temp_fail out-of-band, not in err or the DSN', async () => {
            const errors = ['mx1.example.com:25 connect ECONNREFUSED', 'mx2.example.com:25 socket timeout']
            hmail.mxlist = []
            hmail.mx_errors = [...errors]
            await hmail.try_deliver()

            assert.deepEqual(deferred, { err: 'Tried all MXs example.com', mx_errors: errors })
            assert.equal(warned, `Tried all MXs example.com: ${errors.join('; ')}`)
            const rcpt = hmail.todo.rcpt_to[0]
            assert.equal(rcpt.dsn_status, '5.1.2')
            assert.equal(rcpt.dsn_msg, 'Tried all MXs example.com')
        })

        it('keeps per-MX failures out of the bounce once retries are exhausted', async () => {
            let bounced
            hmail.temp_fail = Hmail.prototype.temp_fail
            hmail.bounce = (err) => {
                bounced = err
            }
            hmail.num_failures = obc.cfg.temp_fail_intervals.length
            hmail.mxlist = []
            hmail.mx_errors = ['10.0.0.5:25 Error: connect ECONNREFUSED']
            await hmail.try_deliver()
            assert.equal(bounced, 'Too many failures (Tried all MXs example.com)')
        })

        it('logs no usable MX hosts when none were attempted', async () => {
            hmail.mxlist = []
            await hmail.try_deliver()
            assert.deepEqual(deferred, { err: 'Tried all MXs example.com', mx_errors: [] })
            assert.equal(warned, 'Tried all MXs example.com: no usable MX hosts')
        })

        it('records get_client failures', async () => {
            client_pool.get_client = (mx, cb) => cb(new Error('connect ECONNREFUSED'))
            hmail.get_force_tls = () => false
            hmail.mxlist = [{ exchange: '192.0.2.1', port: 25 }]
            await hmail.try_deliver()
            assert.deepEqual(deferred.mx_errors, ['192.0.2.1:25 Error: connect ECONNREFUSED'])
        })

        it('records skipped local MXs', async () => {
            obc.cfg.local_mx_ok = false
            net_utils.is_local_host = async () => true
            hmail.mxlist = [{ exchange: '127.0.0.1', from_dns: true }]
            await hmail.try_deliver()
            assert.deepEqual(deferred.mx_errors, ['127.0.0.1 skipped: local MX'])
        })

        it('found_mx resets mx_errors from a prior attempt', async () => {
            hmail.mx_errors = ['stale']
            hmail.try_deliver = () => {}
            await hmail.found_mx([{ exchange: '192.0.2.1', priority: 10 }])
            assert.deepEqual(hmail.mx_errors, [])
        })
    })

    it('sort_mx orders by priority ascending', () => {
        const sorted = hmail.sort_mx([
            { exchange: 'mx2.example.com', priority: 5 },
            { exchange: 'mx1.example.com', priority: 6 },
        ])
        assert.equal(sorted[0].exchange, 'mx2.example.com')
    })

    it('sort_mx shuffles equal-priority entries', () => {
        const sorted = hmail.sort_mx([
            { exchange: 'mx2.example.com', priority: 5 },
            { exchange: 'mx1.example.com', priority: 6 },
            { exchange: 'mx3.example.com', priority: 6 },
        ])
        assert.equal(sorted[0].exchange, 'mx2.example.com')
        assert.ok(['mx1.example.com', 'mx3.example.com'].includes(sorted[1].exchange))
    })

    it('get_force_tls matches by IP and domain', () => {
        hmail.todo = { domain: 'miss.example.com' }
        hmail.obtls.cfg = { force_tls_hosts: ['1.2.3.4', 'hit.example.com'] }
        assert.equal(hmail.get_force_tls({ exchange: '1.2.3.4' }), true)
        assert.equal(hmail.get_force_tls({ exchange: '1.2.3.5' }), false)
        hmail.todo = { domain: 'hit.example.com' }
        assert.equal(hmail.get_force_tls({ exchange: '1.2.3.5' }), true)
    })

    describe('deferred_respond delay', () => {
        let logged

        beforeEach(() => {
            logged = null
            hmail.path = 'test/queue/does-not-exist'
            hmail.temp_fail = () => {} // the constructor's async read of the missing path would re-defer
            hmail.loginfo = (m) => {
                if (m.startsWith('Temp failing')) logged = m
            }
            hmail.bounce = () => {}
        })

        const cases = [
            ['uses params.delay on cont', constants.cont, undefined, { delay: 60, err: 'x' }, 60],
            ['uses denysoft msg as seconds', constants.denysoft, '120', { delay: 60, err: 'x' }, 120],
            [
                'falls back to params.delay on non-numeric denysoft msg',
                constants.denysoft,
                'later',
                { delay: 60, err: 'x' },
                60,
            ],
            [
                'falls back to params.delay on empty denysoft msg',
                constants.denysoft,
                undefined,
                { delay: 60, err: 'x' },
                60,
            ],
            ['uses 0 when params.delay is missing', constants.cont, undefined, { err: 'x' }, 0],
            ['honors a numeric 0 denysoft msg', constants.denysoft, 0, { delay: 60, err: 'x' }, 0],
            ['clamps negative delay to 0', constants.denysoft, '-5', { delay: 60, err: 'x' }, 0],
        ]

        for (const [name, retval, msg, params, expected] of cases) {
            it(name, async () => {
                await hmail.deferred_respond(retval, msg, params)
                assert.equal(logged, `Temp failing ${hmail.filename} for ${expected} seconds: x`)
            })
        }

        it('tolerates missing params', async () => {
            await hmail.deferred_respond(constants.cont, undefined, undefined)
            assert.equal(logged, `Temp failing ${hmail.filename} for 0 seconds: undefined`)
        })
    })
})

const TOOLONG_FIXTURE = 'test/queue/1509000000000_1509000000000_0_99999_ToLong_1_haraka'

const makeToolongFixture = () => {
    const buf = Buffer.alloc(50)
    buf.writeUInt32BE(9999, 0) // declares 9999 bytes but file has only 46 after the header
    buf.write('{"domain":"example.com"', 4)
    fs.writeFileSync(TOOLONG_FIXTURE, buf)
}

describe('outbound/hmail.HMailItem — queue file loading', () => {
    before(makeToolongFixture)

    it('loads a valid queue file', async () => {
        const h = new Hmail(
            '1508455115683_1508455115683_0_90253_9Q4o4V_1_haraka',
            'test/queue/1508455115683_1508455115683_0_90253_9Q4o4V_1_haraka',
            {},
        )
        await onEvent(h, 'ready')
        assert.ok(h)
    })

    it('loads a TODO with multibyte chars without error', async () => {
        const h = new Hmail('1507509981169_1507509981169_0_61403_e0Y0Ym_1_qfile', 'test/fixtures/todo_qfile.txt', {})
        await onEvent(h, 'ready')
        assert.ok(h)
    })

    it('emits error on too-short declared TODO length', async () => {
        const h = new Hmail(
            '1507509981169_1507509981169_0_61403_e0Y0Ym_1_haraka',
            'test/queue/1507509981169_1507509981169_0_61403_e0Y0Ym_1_haraka',
            {},
        )
        const err = await new Promise((resolve) => {
            h.once('ready', () => resolve(null))
            h.once('error', resolve)
        })
        assert.ok(err, 'expected an error for truncated TODO')
    })

    it('emits error on too-long declared TODO length', async () => {
        // Recreate fixture in case a prior run renamed it to the error queue
        makeToolongFixture()
        const h = new Hmail('1509000000000_1509000000000_0_99999_ToLong_1_haraka', TOOLONG_FIXTURE, {})
        const err = await new Promise((resolve) => {
            h.once('ready', () => resolve(null))
            h.once('error', resolve)
        })
        assert.ok(err, 'expected an error for oversized TODO')
    })

    it('skips zero-length file without crash', async () => {
        const h = new Hmail('1507509981169_1507509981169_0_61403_e0Y0Ym_2_zero', 'test/queue/zero-length', {})
        await new Promise((resolve) => {
            h.once('ready', resolve)
            h.once('error', resolve)
        })
        assert.ok(h)
    })

    it('releases queue slot when stat fails on exhausted-retry item (regression #3560)', async () => {
        // When fs.stat fails and num_failures already equals temp_fail_intervals.length,
        // temp_fail() calls convert_temp_failed_to_bounce() while this.todo is null.
        // That must not crash, and must call next_cb() to release the queue slot.
        // attempts=12 in the filename causes num_failures=12 at construction; after
        // temp_fail() increments it to 13 (> temp_fail_intervals.length=12) the
        // overflow path fires with this.todo still null.
        const fname = '1508455115683_1508455115683_12_90253_9Q4o4V_1_haraka'
        const h = new Hmail(fname, '/nonexistent/path/that/cannot/be/stat/ed', {})
        await new Promise((resolve, reject) => {
            const timer = setTimeout(() => reject(new Error('next_cb was never called')), 2000)
            h.next_cb = () => {
                clearTimeout(timer)
                resolve()
            }
        })
        assert.equal(h.todo, null, 'todo must remain null — file was never readable')
    })

    it('lifecycle: reads and writes a queue file', async () => {
        const h = new Hmail('1507509981169_1507509981169_0_61403_e0Y0Ym_2_qfile', 'test/fixtures/todo_qfile.txt', {})

        await onEvent(h, 'ready')

        const tmpfile = path.resolve('test', 'test-queue', 'delete-me')
        await fs.promises.mkdir(path.dirname(tmpfile), { recursive: true })
        const ws = new fs.WriteStream(tmpfile)

        await new Promise((resolve, reject) => {
            outbound.build_todo(h.todo, ws, () => {
                const ds = h.data_stream()
                ds.pipe(ws)
                ws.on('close', resolve)
                ws.on('error', reject)
            })
        })

        assert.equal(fs.statSync(tmpfile).size, 4204)
        fs.unlinkSync(tmpfile)
    })
})
