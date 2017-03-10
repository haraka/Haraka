"use strict";

var generic_pool = require('generic-pool');
var sock         = require('../line_socket');
var server       = require('../server');
var logger       = require('../logger');
var cfg          = require('./config');

function _create_socket (port, host, local_addr, is_unix_socket, connect_timeout, pool_timeout, callback) {
    var socket = is_unix_socket ? sock.connect({path: host}) :
        sock.connect({port: port, host: host, localAddress: local_addr});
    socket.setTimeout(connect_timeout * 1000);
    logger.logdebug('[outbound] host=' +
        host + ' port=' + port + ' pool_timeout=' + pool_timeout + ' created');
    socket.once('connect', function () {
        socket.removeAllListeners('error'); // these get added after callback
        callback(null, socket);
    });
    socket.once('error', function (err) {
        socket.end();
        var name = 'outbound::' + port + ':' + host + ':' + local_addr + ':' + pool_timeout;
        if (server.notes.pool[name]) {
            delete server.notes.pool[name];
        }
        callback("Outbound connection error: " + err, null);
    });
    socket.once('timeout', function () {
        socket.end();
        callback("Outbound connection timed out to " + host + ":" + port, null);
    });
}

// Separate pools are kept for each set of server attributes.
function get_pool (port, host, local_addr, is_unix_socket, connect_timeout, pool_timeout, max) {
    port = port || 25;
    host = host || 'localhost';
    connect_timeout = (connect_timeout === undefined) ? 30 : connect_timeout;
    var name = 'outbound::' + port + ':' + host + ':' + local_addr + ':' + pool_timeout;
    if (!server.notes.pool) {
        server.notes.pool = {};
    }
    if (!server.notes.pool[name]) {
        var pool = generic_pool.Pool({
            name: name,
            create: function (done) {
                _create_socket(port, host, local_addr, is_unix_socket, connect_timeout, pool_timeout, done);
            },
            validate: function (socket) {
                return socket.writable;
            },
            destroy: function (socket) {
                logger.logdebug('[outbound] destroying pool entry for ' + host + ':' + port);
                // Remove pool object from server notes once empty
                var size = pool.getPoolSize();
                if (size === 0) {
                    delete server.notes.pool[name];
                }
                socket.removeAllListeners();
                socket.once('error', function (err) {
                    logger.logwarn("[outbound] Socket got an error while shutting down: " + err);
                });
                if (!socket.writable) return;
                logger.logprotocol("[outbound] C: QUIT");
                socket.write("QUIT\r\n");
                socket.end(); // half close
                socket.once('line', function (line) {
                    // Just assume this is a valid response
                    logger.logprotocol("[outbound] S: " + line);
                    socket.destroy();
                });
            },
            max: max || 10,
            idleTimeoutMillis: pool_timeout * 1000,
            log: function (str, level) {
                if (/this._availableObjects.length=/.test(str)) return;
                level = (level === 'verbose') ? 'debug' : level;
                logger['log' + level]('[outbound] [' + name + '] ' + str);
            }
        });
        server.notes.pool[name] = pool;
    }
    return server.notes.pool[name];
}

// Get a socket for the given attributes.
exports.get_client = function (port, host, local_addr, is_unix_socket, callback) {
    if (cfg.pool_concurrency_max == 0) {
        return _create_socket(port, host, local_addr, is_unix_socket, cfg.connect_timeout, cfg.pool_timeout, callback);
    }

    var pool = get_pool(port, host, local_addr, is_unix_socket, cfg.connect_timeout, cfg.pool_timeout, cfg.pool_concurrency_max);
    if (pool.waitingClientsCount() >= cfg.pool_concurrency_max) {
        return callback("Too many waiting clients for pool", null);
    }
    pool.acquire(function (err, socket) {
        if (err) return callback(err);
        socket.__acquired = true;
        callback(null, socket);
    });
}

exports.release_client = function (socket, port, host, local_addr, error) {
    logger.logdebug("[outbound] release_client: " + host + ":" + port + " to " + local_addr);

    if (cfg.pool_concurrency_max == 0) {
        return sockend();
    }

    if (!socket.__acquired) {
        logger.logerror("Release an un-acquired socket. Stack: " + (new Error()).stack);
        return;
    }
    socket.__acquired = false;

    var pool_timeout = cfg.pool_timeout;
    var name = 'outbound::' + port + ':' + host + ':' + local_addr + ':' + pool_timeout;
    if (!(server.notes && server.notes.pool)) {
        logger.logcrit("[outbound] Releasing a pool (" + name + ") that doesn't exist!");
        return;
    }
    var pool = server.notes.pool[name];
    if (!pool) {
        logger.logcrit("[outbound] Releasing a pool (" + name + ") that doesn't exist!");
        return;
    }

    if (error) {
        return sockend();
    }

    if (cfg.pool_timeout == 0) {
        logger.loginfo("[outbound] Pool_timeout is zero - shutting it down");
        return sockend();
    }

    socket.removeAllListeners('close');
    socket.removeAllListeners('error');
    socket.removeAllListeners('end');
    socket.removeAllListeners('timeout');
    socket.removeAllListeners('line');

    socket.__fromPool = true;

    socket.once('error', function (err) {
        logger.logwarn("[outbound] Socket [" + name + "] in pool got an error: " + err);
        sockend();
    });

    socket.once('end', function () {
        logger.logwarn("[outbound] Socket [" + name + "] in pool got FIN");
        sockend();
    });

    pool.release(socket);

    function sockend () {
        if (server.notes.pool[name]) {
            server.notes.pool[name].destroy(socket);
        }
        socket.removeAllListeners();
        socket.destroy();
    }
}
