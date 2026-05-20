'use strict'

const assert = require('node:assert/strict')
const { describe, it, beforeEach } = require('node:test')

const fixtures = require('haraka-test-fixtures')
const outbound = require('../../outbound')
const TimerQueue = require('../../outbound/timer_queue')

const Connection = fixtures.connection

const _set_up = () => {
    this.plugin = new fixtures.plugin('status')
    this.plugin.outbound = outbound

    this.connection = Connection.createConnection()
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
