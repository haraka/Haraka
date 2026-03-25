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
            assert.doesNotThrow(() => socket.emit('error', new Error('late error')), 'error after timeout must not crash')
        })

        it('multiple timeouts do not throw ERR_UNHANDLED_ERROR', () => {
            const socket = makeSocket()
            hmail.try_deliver_host_on_socket(mx, '1.2.3.4', 25, socket)
            socket.emit('timeout')
            assert.doesNotThrow(() => socket.emit('timeout'), 'second timeout must not crash')
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
        const h = new Hmail(
            '1509000000000_1509000000000_0_99999_ToLong_1_haraka',
            TOOLONG_FIXTURE,
            {},
        )
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
