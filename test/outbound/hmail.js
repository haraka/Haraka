const assert = require('node:assert')
const { EventEmitter } = require('node:events')
const fs = require('node:fs')
const path = require('node:path')

const Hmail = require('../../outbound/hmail')
const outbound = require('../../outbound/index')
const client_pool = require('../../outbound/client_pool')

describe('outbound/hmail', () => {
    beforeEach((done) => {
        this.hmail = new Hmail(
            '1508455115683_1508455115683_0_90253_9Q4o4V_1_haraka',
            'test/queue/1508455115683_1508455115683_0_90253_9Q4o4V_1_haraka',
            {},
        )
        done()
    })

    // Issue #3388: socket.once('error') is consumed by the first error.
    // When socket.once('timeout') subsequently fires and emits another error,
    // there is no handler left → Node throws ERR_UNHANDLED_ERROR and crashes.
    describe('socket error/timeout handler robustness (#3388)', () => {
        const mx = { using_lmtp: false, port: 25, exchange: 'mx.example.com', bind: null, bind_helo: 'test' }

        function makeSocket() {
            const s = new EventEmitter()
            s.name = 'mock'
            s.writable = true
            s.write = () => {}
            s.destroy = () => {}
            return s
        }

        let origRelease

        beforeEach(() => {
            origRelease = client_pool.release_client
            client_pool.release_client = () => {}
            this.hmail.todo = { rcpt_to: [] }
            this.hmail.try_deliver = () => {}
            this.hmail.logerror = () => {}
        })

        afterEach(() => {
            client_pool.release_client = origRelease
        })

        it('error then timeout does not throw ERR_UNHANDLED_ERROR', () => {
            const socket = makeSocket()
            this.hmail.try_deliver_host_on_socket(mx, '1.2.3.4', 25, socket)

            // First error fires and consumes the once('error') handler
            socket.emit('error', new Error('connection refused'))

            // Timeout now fires → emits a second error → was unhandled before fix
            assert.doesNotThrow(
                () => socket.emit('timeout'),
                'ERR_UNHANDLED_ERROR: timeout after error must not crash',
            )
        })

        it('timeout then error does not throw ERR_UNHANDLED_ERROR', () => {
            const socket = makeSocket()
            this.hmail.try_deliver_host_on_socket(mx, '1.2.3.4', 25, socket)

            // Timeout fires first — internally emits error, consuming once('error')
            socket.emit('timeout')

            // A subsequent socket error — was unhandled before fix
            assert.doesNotThrow(
                () => socket.emit('error', new Error('late socket error')),
                'ERR_UNHANDLED_ERROR: error after timeout-triggered error must not crash',
            )
        })

        it('multiple timeouts do not throw ERR_UNHANDLED_ERROR', () => {
            const socket = makeSocket()
            this.hmail.try_deliver_host_on_socket(mx, '1.2.3.4', 25, socket)

            socket.emit('timeout')
            assert.doesNotThrow(() => socket.emit('timeout'), 'ERR_UNHANDLED_ERROR: second timeout must not crash')
        })
    })

    it('sort_mx', (done) => {
        const sorted = this.hmail.sort_mx([
            { exchange: 'mx2.example.com', priority: 5 },
            { exchange: 'mx1.example.com', priority: 6 },
        ])
        assert.equal(sorted[0].exchange, 'mx2.example.com')
        done()
    })

    it('sort_mx, shuffled', (done) => {
        const sorted = this.hmail.sort_mx([
            { exchange: 'mx2.example.com', priority: 5 },
            { exchange: 'mx1.example.com', priority: 6 },
            { exchange: 'mx3.example.com', priority: 6 },
        ])
        assert.equal(sorted[0].exchange, 'mx2.example.com')
        assert.ok(sorted[1].exchange == 'mx3.example.com' || sorted[1].exchange == 'mx1.example.com')
        done()
    })

    it('force_tls', (done) => {
        this.hmail.todo = { domain: 'miss.example.com' }
        this.hmail.obtls.cfg = {
            force_tls_hosts: ['1.2.3.4', 'hit.example.com'],
        }
        assert.equal(this.hmail.get_force_tls({ exchange: '1.2.3.4' }), true)
        assert.equal(this.hmail.get_force_tls({ exchange: '1.2.3.5' }), false)
        this.hmail.todo = { domain: 'hit.example.com' }
        assert.equal(this.hmail.get_force_tls({ exchange: '1.2.3.5' }), true)
        done()
    })
})

describe('outbound/hmail.HMailItem', () => {
    it('normal queue file', (done) => {
        this.hmail = new Hmail(
            '1508455115683_1508455115683_0_90253_9Q4o4V_1_haraka',
            'test/queue/1508455115683_1508455115683_0_90253_9Q4o4V_1_haraka',
            {},
        )
        this.hmail.on('ready', () => {
            // console.log(this.hmail);
            assert.ok(this.hmail)
            done()
        })
        this.hmail.on('error', (err) => {
            console.log(err)
            assert.equal(err, undefined)
            done()
        })
    })

    it('normal TODO w/multibyte chars loads w/o error', (done) => {
        this.hmail = new Hmail('1507509981169_1507509981169_0_61403_e0Y0Ym_1_qfile', 'test/fixtures/todo_qfile.txt', {})
        this.hmail.on('ready', () => {
            // console.log(this.hmail);
            assert.ok(this.hmail)
            done()
        })
        this.hmail.on('error', (err) => {
            console.log(err)
            assert.equal(err, undefined)
            done()
        })
    })

    it('too short TODO length declared', (done) => {
        this.hmail = new Hmail(
            '1507509981169_1507509981169_0_61403_e0Y0Ym_1_haraka',
            'test/queue/1507509981169_1507509981169_0_61403_e0Y0Ym_1_haraka',
            {},
        )
        this.hmail.on('ready', () => {
            // console.log(this.hmail);
            assert.ok(this.hmail)
            done()
        })
        this.hmail.on('error', (err) => {
            console.log(err)
            assert.ok(err)
            done()
        })
    })

    it('too long TODO length declared', (done) => {
        this.hmail = new Hmail(
            '1508269674999_1508269674999_0_34002_socVUF_1_haraka',
            'test/queue/1508269674999_1508269674999_0_34002_socVUF_1_haraka',
            {},
        )
        this.hmail.on('ready', () => {
            // console.log(this.hmail);
            assert.ok(this.hmail)
            done()
        })
        this.hmail.on('error', (err) => {
            console.log(err)
            assert.ok(err)
            done()
        })
    })

    it('zero-length file load skip w/o crash', (done) => {
        this.hmail = new Hmail('1507509981169_1507509981169_0_61403_e0Y0Ym_2_zero', 'test/queue/zero-length', {})
        this.hmail.on('ready', () => {
            assert.ok(this.hmail)
            done()
        })
        this.hmail.on('error', (err) => {
            console.error(err)
            assert.ok(err)
            done()
        })
    })

    it('lifecycle, reads and writes a haraka queue file', (done) => {
        this.hmail = new Hmail('1507509981169_1507509981169_0_61403_e0Y0Ym_2_qfile', 'test/fixtures/todo_qfile.txt', {})

        this.hmail.on('error', (err) => {
            // console.log(err);
            assert.equals(err, undefined)
            done()
        })

        this.hmail.on('ready', () => {
            const tmpfile = path.resolve('test', 'test-queue', 'delete-me')
            const ws = new fs.createWriteStream(tmpfile)

            outbound.build_todo(this.hmail.todo, ws, () => {
                // console.log('returned from build_todo, piping')
                // console.log(this.hmail.todo)
                // assert.equals(this.hmail.todo.message_stream.headers.length, 22);

                const ds = this.hmail.data_stream()
                ds.pipe(ws)

                ws.on('close', () => {
                    // console.log(this.hmail.todo)
                    assert.equal(fs.statSync(tmpfile).size, 4204)
                    done()
                })
            })
        })
    })
})
