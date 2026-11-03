'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { describe, it, beforeEach, afterEach } = require('node:test')

const fixtures = require('haraka-test-fixtures')
const { makeConnection, makePlugin } = fixtures
const outbound = require('../../outbound')
const { TimerQueue } = require('haraka-utils')

const _set_up = () => {
    this.plugin = makePlugin('status', { register: false })
    this.plugin.outbound = outbound

    this.connection = makeConnection()
    this.connection.remote.is_local = true
}

describe('status', () => {
    describe('register', () => {
        beforeEach(_set_up)

        it('loads the status plugin', () => {
            assert.equal('status', this.plugin.name)
        })
    })

    describe('access', () => {
        beforeEach(_set_up)

        it('remote', (t, done) => {
            this.connection.remote.is_local = false
            this.plugin.hook_unrecognized_command(
                (code) => {
                    assert.equal(DENY, code)
                    done()
                },
                this.connection,
                ['STATUS', 'POOL LIST'],
            )
        })
    })

    describe('pools', () => {
        beforeEach(_set_up)

        it('list_pools', (t, done) => {
            this.connection.respond = (code, message) => {
                const data = JSON.parse(message)
                assert.equal('object', typeof data) // there should be one pools array for noncluster and more for cluster
                done()
            }
            this.plugin.hook_unrecognized_command(() => {}, this.connection, ['STATUS', 'POOL LIST'])
        })
    })

    describe('queues', () => {
        beforeEach(_set_up)

        it('inspect_queue', (t, done) => {
            // should list delivery_queue and temp_fail_queue per cluster children
            outbound.temp_fail_queue = new TimerQueue(10)
            outbound.temp_fail_queue.add('file1', 100, () => {})
            outbound.temp_fail_queue.add('file2', 100, () => {})

            this.connection.respond = (code, message) => {
                const data = JSON.parse(message)
                assert.equal(0, data.delivery_queue.length)
                assert.equal(2, data.temp_fail_queue.length)
                done()
            }
            this.plugin.hook_unrecognized_command(() => {}, this.connection, ['STATUS', 'QUEUE INSPECT'])
        })

        it('stat_queue', (t, done) => {
            // should list files only
            this.connection.respond = (code, message) => {
                const data = JSON.parse(message)
                assert.ok(/^\d+\/\d+\/\d+$/.test(data))
                done()
            }
            this.plugin.hook_unrecognized_command(() => {}, this.connection, ['STATUS', 'QUEUE STATS'])
        })

        it('list_queue', (t, done) => {
            // should list files only
            this.connection.respond = (code, message) => {
                const data = JSON.parse(message)
                assert.equal(0, data.length)
                done()
            }
            this.plugin.hook_unrecognized_command(() => {}, this.connection, ['STATUS', 'QUEUE LIST'])
        })

        it('discard_from_queue', (t, done) => {
            const self = this

            outbound.temp_fail_queue = new TimerQueue(10)
            outbound.temp_fail_queue.add('file1', 10, () => {
                assert.ok(false, 'This callback should not be called')
                done()
            })

            outbound.temp_fail_queue.add('file2', 2000, () => {})

            this.plugin.hook_unrecognized_command(
                () => {
                    self.connection.respond = (code, message) => {
                        const data = JSON.parse(message)
                        assert.equal(1, data.temp_fail_queue.length)
                        done()
                    }
                    self.plugin.hook_unrecognized_command(() => {}, self.connection, ['STATUS', 'QUEUE INSPECT'])
                },
                this.connection,
                ['STATUS', 'QUEUE DISCARD file1'],
            )
        })

        describe('discard containment', () => {
            beforeEach(() => {
                this.tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'haraka-status-'))
                this.plugin.queue_dir = path.join(this.tmp, 'queue')
                fs.mkdirSync(this.plugin.queue_dir)
                this.canary = path.join(this.tmp, 'canary.txt')
                fs.writeFileSync(this.canary, 'x')
            })

            afterEach(() => {
                fs.rmSync(this.tmp, { recursive: true, force: true })
            })

            for (const file of ['../canary.txt', '..', '.', 'sub/../../canary.txt', '/etc/passwd', undefined]) {
                it(`rejects ${file}`, (t, done) => {
                    this.plugin.queue_discard(file, (err) => {
                        assert.equal(err?.message, 'invalid queue file')
                        assert.ok(fs.existsSync(this.canary))
                        done()
                    })
                })
            }

            it('denies traversal via STATUS command', (t, done) => {
                this.plugin.hook_unrecognized_command(
                    (code, msg) => {
                        assert.equal(code, DENY)
                        assert.equal(msg, 'invalid queue file')
                        assert.ok(fs.existsSync(this.canary))
                        done()
                    },
                    this.connection,
                    ['STATUS', 'QUEUE DISCARD ../canary.txt'],
                )
            })

            it('rejects before forwarding to cluster master', (t, done) => {
                this.plugin.call_master = () => assert.fail('forwarded to master')
                this.plugin.command_action = () => assert.fail('dispatched locally')
                this.plugin.run('QUEUE DISCARD ../canary.txt', (err) => {
                    assert.equal(err?.message, 'invalid queue file')
                    done()
                })
            })

            it('unlinks a file in queue_dir', (t, done) => {
                const qfile = path.join(this.plugin.queue_dir, '1234_0_1_5678_abcd_1_host')
                fs.writeFileSync(qfile, 'x')
                this.plugin.queue_discard(path.basename(qfile), (err, res) => {
                    assert.ifError(err)
                    assert.equal(res, 'OK')
                    assert.ok(!fs.existsSync(qfile))
                    done()
                })
            })
        })

        it('push_email_at_queue', (t, done) => {
            const timeout = setTimeout(() => {
                assert.ok(false, 'Timeout')
                done()
            }, 1000)

            outbound.temp_fail_queue.add('file', 1500, () => {
                clearTimeout(timeout)

                assert.ok(true)
                done()
            })

            this.plugin.hook_unrecognized_command(() => {}, this.connection, ['STATUS', 'QUEUE PUSH file'])
        })
    })

    describe('merge_worker_responses', () => {
        beforeEach(_set_up)

        it('POOL LIST merges objects from all workers', () => {
            const result = JSON.parse(
                JSON.stringify(
                    this.plugin.merge_worker_responses('POOL LIST', [
                        { 'host1:25': { inUse: 1, size: 3 } },
                        { 'host2:25': { inUse: 0, size: 2 } },
                        {},
                    ]),
                ),
            )
            assert.deepEqual(result, {
                'host1:25': { inUse: 1, size: 3 },
                'host2:25': { inUse: 0, size: 2 },
            })
        })

        it('POOL LIST with all empty workers returns empty object', () => {
            const result = JSON.parse(JSON.stringify(this.plugin.merge_worker_responses('POOL LIST', [{}, {}, {}])))
            assert.deepEqual(result, {})
        })

        it('QUEUE INSPECT merges queues from all workers', () => {
            const result = JSON.parse(
                JSON.stringify(
                    this.plugin.merge_worker_responses('QUEUE INSPECT', [
                        { delivery_queue: [{ id: 'a' }], temp_fail_queue: [{ id: 'x', fire_time: 1 }] },
                        { delivery_queue: [{ id: 'b' }], temp_fail_queue: [] },
                        { delivery_queue: [], temp_fail_queue: [{ id: 'y', fire_time: 2 }] },
                    ]),
                ),
            )
            assert.deepEqual(result, {
                delivery_queue: [{ id: 'a' }, { id: 'b' }],
                temp_fail_queue: [
                    { id: 'x', fire_time: 1 },
                    { id: 'y', fire_time: 2 },
                ],
            })
        })

        it('QUEUE INSPECT with all empty queues returns empty lists', () => {
            const result = JSON.parse(
                JSON.stringify(
                    this.plugin.merge_worker_responses('QUEUE INSPECT', [
                        { delivery_queue: [], temp_fail_queue: [] },
                        { delivery_queue: [], temp_fail_queue: [] },
                    ]),
                ),
            )
            assert.deepEqual(result, { delivery_queue: [], temp_fail_queue: [] })
        })

        it('QUEUE STATS sums across workers', () => {
            const result = this.plugin.merge_worker_responses('QUEUE STATS', ['1/2/3', '0/1/0', '2/0/1'])
            assert.equal(result, '3/3/4')
        })

        it('QUEUE STATS with all zeros', () => {
            const result = this.plugin.merge_worker_responses('QUEUE STATS', ['0/0/0', '0/0/0', '0/0/0'])
            assert.equal(result, '0/0/0')
        })

        it('unknown command returns results array unchanged', () => {
            const result = this.plugin.merge_worker_responses('POOL UNKNOWN', [{ foo: 1 }, { foo: 2 }])
            assert.equal(result.length, 2)
        })
    })
})
