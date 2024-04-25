'use strict';

const assert = require('node:assert')

const fixtures = require('haraka-test-fixtures');
const outbound = require('../../outbound');
const TimerQueue = require('../../outbound/timer_queue');

const Connection = fixtures.connection;

const _set_up = (done) => {
    this.plugin = new fixtures.plugin('status');
    this.plugin.outbound = outbound;

    this.connection = Connection.createConnection();
    this.connection.remote.is_local = true;
    done();
}

describe('status', () => {

    describe('register', () => {
        beforeEach(_set_up)

        it('loads the status plugin', () => {
            assert.equal('status', this.plugin.name);
        })
    })

    describe('access', () => {
        beforeEach(_set_up)

        it('remote', (done) => {
            this.connection.remote.is_local = false;
            this.plugin.hook_unrecognized_command((code) => {
                assert.equal(DENY, code);
                done();
            }, this.connection, ['STATUS', 'POOL LIST']);
        })
    })

    describe('pools', () => {
        beforeEach(_set_up)

        it('list_pools', (done) => {
            this.connection.respond = (code, message) => {
                const data = JSON.parse(message);
                assert.equal('object', typeof data); // there should be one pools array for noncluster and more for cluster
                done();
            };
            this.plugin.hook_unrecognized_command(() => {}, this.connection, ['STATUS', 'POOL LIST']);
        })
    })

    describe('queues', () => {
        beforeEach(_set_up)

        it('inspect_queue', (done) => {
            // should list delivery_queue and temp_fail_queue per cluster children
            outbound.temp_fail_queue = new TimerQueue(10);
            outbound.temp_fail_queue.add('file1', 100, () => {});
            outbound.temp_fail_queue.add('file2', 100, () => {});

            this.connection.respond = (code, message) => {
                const data = JSON.parse(message);
                assert.equal(0, data.delivery_queue.length);
                assert.equal(2, data.temp_fail_queue.length);
                done();
            };
            this.plugin.hook_unrecognized_command(() => {}, this.connection, ['STATUS', 'QUEUE INSPECT']);
        })

        it('stat_queue', (done) => {
            // should list files only
            this.connection.respond = (code, message) => {
                const data = JSON.parse(message);
                assert.ok(/^\d+\/\d+\/\d+$/.test(data));
                done();
            };
            this.plugin.hook_unrecognized_command(() => {}, this.connection, ['STATUS', 'QUEUE STATS']);
        })

        it('list_queue', (done) => {
            // should list files only
            this.connection.respond = (code, message) => {
                const data = JSON.parse(message);
                assert.equal(0, data.length);
                done();
            };
            this.plugin.hook_unrecognized_command(() => {}, this.connection, ['STATUS', 'QUEUE LIST']);
        })

        it('discard_from_queue', (done) => {
            const self = this;

            outbound.temp_fail_queue = new TimerQueue(10);
            outbound.temp_fail_queue.add('file1', 10, () => {
                assert.ok(false, 'This callback should not be called');
                done();
            })

            outbound.temp_fail_queue.add('file2', 2000, () => {});

            this.plugin.hook_unrecognized_command(() => {
                self.connection.respond = (code, message) => {
                    const data = JSON.parse(message);
                    assert.equal(1, data.temp_fail_queue.length);
                    done();
                }
                self.plugin.hook_unrecognized_command(() => {}, self.connection, ['STATUS', 'QUEUE INSPECT']);
            }, this.connection, ['STATUS', 'QUEUE DISCARD file1']);
        })

        it('push_email_at_queue', (done) => {
            const timeout = setTimeout(() => {
                assert.ok(false, 'Timeout');
                done();
            }, 1000);

            outbound.temp_fail_queue.add('file', 1500, () => {
                clearTimeout(timeout);

                assert.ok(true);
                done();
            });

            this.plugin.hook_unrecognized_command(() => {}, this.connection, ['STATUS', 'QUEUE PUSH file']);
        })
    })
})