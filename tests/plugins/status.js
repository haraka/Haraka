'use strict';

const fixtures = require('haraka-test-fixtures');
const outbound = require('../../outbound');
const TimerQueue = require('../../outbound/timer_queue');

const Connection = fixtures.connection;

function _set_up (done) {
    this.plugin = new fixtures.plugin('status');
    this.plugin.outbound = outbound;

    this.connection = Connection.createConnection();
    this.connection.remote.is_local = true;
    done();
}

exports.register = {
    setUp : _set_up,
    'loads the status plugin': function (test) {
        test.expect(1);
        test.equal('status', this.plugin.name);
        test.done();
    },
}

exports.access = {
    setUp : _set_up,
    'remote': function (test) {

        test.expect(1);
        function cb (code) {
            test.equal(DENY, code);
            test.done();
        }

        this.connection.remote.is_local = false;

        this.plugin.hook_unrecognized_command(cb, this.connection, ['STATUS', 'POOL LIST']);
    }
}

exports.pools = {
    setUp : _set_up,
    'list_pools': function (test) {

        test.expect(1);
        this.connection.respond = function (code, message) {
            const data = JSON.parse(message);
            test.equal('object', typeof data); // there should be one pools array for noncluster and more for cluster
            test.done();
        };

        this.plugin.hook_unrecognized_command(function () {}, this.connection, ['STATUS', 'POOL LIST']);
    }
}

exports.queues = {
    setUp : _set_up,
    'inspect_queue': function (test) {
        // should list delivery_queue and temp_fail_queue per cluster children
        test.expect(2);

        outbound.temp_fail_queue = new TimerQueue(10);
        outbound.temp_fail_queue.add("file1", 100, function () {});
        outbound.temp_fail_queue.add("file2", 100, function () {});

        this.connection.respond = function (code, message) {
            const data = JSON.parse(message);
            test.equal(0, data.delivery_queue.length);
            test.equal(2, data.temp_fail_queue.length);
            test.done();
        };
        this.plugin.hook_unrecognized_command(function () {}, this.connection, ['STATUS', 'QUEUE INSPECT']);
    },
    'stat_queue': function (test) {
        // should list files only
        test.expect(1);

        this.connection.respond = function (code, message) {
            const data = JSON.parse(message);
            test.ok(/^\d+\/\d+\/\d+$/.test(data));
            test.done();
        };
        this.plugin.hook_unrecognized_command(function () {}, this.connection, ['STATUS', 'QUEUE STATS']);
    },
    'list_queue': function (test) {
        // should list files only
        test.expect(1);

        this.connection.respond = function (code, message) {
            const data = JSON.parse(message);
            test.equal(0, data.length);
            test.done();
        };
        this.plugin.hook_unrecognized_command(function () {}, this.connection, ['STATUS', 'QUEUE LIST']);
    },
    'discard_from_queue': function (test) {
        const self = this;

        test.expect(1);

        outbound.temp_fail_queue = new TimerQueue(10);
        outbound.temp_fail_queue.add("file1", 10, function () {
            test.ok(false, "This callback should not be called");
            test.done();
        });
        outbound.temp_fail_queue.add("file2", 2000, function () {});

        function res () {
            self.connection.respond = function (code, message) {
                const data = JSON.parse(message);
                test.equal(1, data.temp_fail_queue.length);
                test.done();
            };
            self.plugin.hook_unrecognized_command(function () {}, self.connection, ['STATUS', 'QUEUE INSPECT']);
        }

        this.plugin.hook_unrecognized_command(res, this.connection, ['STATUS', 'QUEUE DISCARD file1']);
    },
    'push_email_at_queue': function (test) {
        test.expect(1);

        const timeout = setTimeout(function () {
            test.ok(false, "Timouted");
            test.done();
        }, 1000);

        outbound.temp_fail_queue.add("file", 1500, function () {
            clearTimeout(timeout);

            test.ok(true);
            test.done();
        });

        this.plugin.hook_unrecognized_command(function () {}, this.connection, ['STATUS', 'QUEUE PUSH file']);
    },
}
