'use strict';

const fs = require('fs');
const path = require('path');
const async = require('async');

exports.register = function () {
    this.outbound = require('./../outbound');
    this.queue_dir = require('./../outbound/queue').queue_dir;
}

exports.hook_capabilities = function (next, connection) {

    if (connection.remote.ip === '127.0.0.1' || connection.remote.ip === '::1') {
        connection.capabilities.push('STATUS');
    }

    next();
}

exports.hook_unrecognized_command = function (next, connection, params) {
    const self = this;

    const result_process = function (err, result) {
        if (err) return next(DENY, err.message);
        return connection.respond(211, result ? JSON.stringify(result) : "null", () => next(OK));
    };

    if (params[0] !== 'STATUS') {
        next();
    }
    else if (connection.remote.ip !== '127.0.0.1' && connection.remote.ip !== '::1') {
        return next(DENY, "STATUS not allowed remotely");
    }
    else {
        if (server.cluster && !params[1].match(/^QUEUE LIST/)) {
            self.call_master(params[1], result_process);
        }
        else {
            self.command_action(params[1], result_process);
        }
    }
}

exports.command_action = function (cmd, cb) {
    const self = this;
    const params = cmd.split(' ');

    switch (params.shift()) {
        case 'POOL':
            return self.pool_action(params, cb);
        case 'QUEUE':
            return self.queue_action(params, cb);
        default:
            cb("unknown STATUS command")
    }
}

exports.pool_action = function (params, cb) {
    const self = this;

    switch (params.shift()) {
        case 'LIST':
            return self.pool_list(cb);
        default:
            cb("unknown POOL command")
    }
}

exports.queue_action = function (params, cb) {
    const self = this;

    switch (params.shift()) {
        case 'LIST':
            return self.queue_list(cb);
        case 'STATS':
            return self.queue_stats(cb);
        case 'INSPECT':
            return self.queue_inspect(cb);
        case 'DISCARD':
            return self.queue_discard(params.shift(), cb);
        case 'PUSH':
            return self.queue_push(params.shift(), cb);
        default:
            cb("unknown QUEUE command")
    }
}

exports.pool_list = function (cb) {
    const result = {};

    if (server.notes.pool) {
        Object.keys(server.notes.pool).forEach(function (name) {
            const instance = server.notes.pool[name];

            result[name] = {inUse: instance.inUseObjectsCount(), size: instance.getPoolSize()};
        });
    }

    cb(null, result);
}

exports.queue_list = function (cb) {
    this.outbound.list_queue(function (err, qlist) {
        if (err) cb(err);

        const result = [];

        if (qlist) {
            qlist.forEach(function (todo) {
                result.push({
                    file: todo.file,
                    uuid: todo.uuid,
                    queue_time: todo.queue_time,
                    domain: todo.domain,
                    from: todo.mail_from.toString(),
                    to: todo.rcpt_to.map((r) => r.toString())
                });
            });
        }

        cb(err, result);
    });
}

exports.queue_stats = function (cb) {
    cb(null, this.outbound.get_stats());
}

exports.queue_inspect = function (cb) {
    cb(null, {
        delivery_queue: this.outbound.delivery_queue._tasks.toArray().map(function (h) {
            return {id: h.file};
        }),
        temp_fail_queue: this.outbound.temp_fail_queue.queue.map(function (i) {
            return {id: i.id, fire_time: i.fire_time};
        })
    });
}

exports.queue_discard = function (file, cb) {
    try {
        this.outbound.temp_fail_queue.discard(file);
    }
    catch (e) {
        // we ignore not found error
    }

    fs.unlink(path.join(this.queue_dir, file), function () {
        cb(null, "OK");
    });
}

exports.queue_push = function (file, cb) {
    for (let i = 0; i < this.outbound.temp_fail_queue.queue.length; i++) {
        const ti = this.outbound.temp_fail_queue.queue[i];
        if (ti.id !== file) continue;
        ti.fire_time = -1;
        break;
    }

    cb(null, "OK");
}

// cluster IPC

exports.hook_init_master = function (next) {
    const self = this;

    if (!server.cluster) return next();

    const messageHandler = function (sender, msg) {
        if (msg.event === 'status.request') {
            self.call_workers(msg, function (err, response) {
                msg.result = response.filter((el) => el != null);
                msg.event = 'status.result';
                sender.send(msg);
            });
        }
    };

    server.cluster.on('message', messageHandler);
    next();
}

exports.hook_init_child = function (next) {
    const self = this;

    const messageHandler = function (msg) {
        if (msg.event === 'status.request') {
            self.command_action(msg.params, function (err, result) {
                msg.event = 'status.response';
                msg.result = result;
                process.send(msg);
            });
        }
    };

    process.on('message', messageHandler);
    next();
}

exports.call_master = function (cmd, cb) {
    const messageHandler = function (msg) {
        if (msg && msg.event === 'status.result') {
            process.removeListener('message', messageHandler);
            cb(null, msg.result);
        }
    };

    process.on('message', messageHandler);
    process.send({event: 'status.request', params: cmd});
}

exports.call_workers = function (cmd, cb) {
    const self = this;

    async.map(server.cluster.workers, function (w, done) {
        self.call_worker(w, cmd, done);
    }, cb);
}

// sends command to worker and then wait for response or timeout
exports.call_worker = function (worker, cmd, cb) {
    let timeout;

    const listen_responses = function (sender, msg) {
        if (sender.id !== worker.id) return;
        if (msg.event !== 'status.response') return;

        clearTimeout(timeout);
        server.cluster.removeListener('message', listen_responses);

        cb(null, msg.result);
    };

    timeout = setTimeout(function () {
        server.cluster.removeListener('message', listen_responses);
        cb();
    }, 1000);


    server.cluster.on('message', listen_responses);
    worker.send(cmd);
}