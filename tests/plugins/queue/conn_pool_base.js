var stub             = require('../../fixtures/stub'),
    constants        = require('../../../constants'),
    Connection       = require('../../fixtures/stub_connection'),
    Plugin           = require('../../fixtures/stub_plugin');

// huge hack here, but plugin tests need constants
constants.import(global);

function _set_up(callback) {
    this.backup = {};

    // needed for tests
    this.plugin = new Plugin('queue/conn_pool_base');
    this.connection = Connection.createConnection();

    // backup modifications

    // stub out functions
    this.connection.logdebug = stub();
    this.connection.notes = stub();
    this.connection.server = stub();
    this.connection.server.notes = stub();
    this.next = stub();

    // going to need these in multiple tests

    callback();
}

function _tear_down(callback) {
    // restore backed up functions

    callback();
}

exports.conn_pool_base = {
    setUp : _set_up,
    tearDown : _tear_down,
    'should have conn_get function' : function (test) {
        test.expect(2);
        test.isNotNull(this.plugin);
        test.isFunction(this.plugin.conn_get);
        test.done();
    },
    'conn_get should throw with missing argument 0' : function (test) {
        test.expect(2);

        try {
            this.plugin.conn_get(null, 'localhost', 25, 0);
        }
        catch (err) {
            test.isNotNull(err);
            test.equals(err.message, "Invalid Arguments");
        }

        test.done();
    },
    'conn_get should set connection.notes.conn' : function (test) {
        test.expect(2);

        try {
            this.plugin.conn_get(this.connection, 'localhost', 25, 0);
            test.isNotUndefined(this.connection.notes.conn);
            test.isNotNull(this.connection.notes.conn);
        }
        catch (err) {
            console.log(err.stack);
        }

        test.done();
    },
    'conn_get should set connection.notes.conn.socket' : function (test) {
        test.expect(3);

        try {
            this.plugin.conn_get(this.connection, 'localhost', 25, 0);
            test.isNotUndefined(this.connection.notes.conn.socket);
            test.isNotNull(this.connection.notes.conn.socket);
            test.isObject(this.connection.notes.conn.socket);
        }
        catch (err) {
            console.log(err.stack);
        }

        test.done();
    },
    'conn_get should call connection.notes.conn.socket.setTimeout' :
        function (test) {
            test.expect(2);
    
            try {
                this.plugin.conn_get(this.connection, 'localhost', 25, 666);
                test.ok(this.connection.notes.conn.socket.setTimeout.called);
                test.equals(
                    this.connection.notes.conn.socket.setTimeout.args[0],
                    1000 * 666);
            }
            catch (err) {
                console.log(err.stack);
            }
    
            test.done();
        },
    'conn_get should set connection.notes.conn.pool_connection false' :
        function (test) {
            test.expect(1);

            try {
                this.plugin.conn_get(this.connection, 'localhost', 25, 0);
                test.ok(!this.connection.notes.conn.pool_connection);
            }
            catch (err) {
                console.log(err.stack);
            }

            test.done();
        },
    'conn_get should set connection.notes.conn.pool_connection true' :
        function (test) {
            test.expect(1);

            try {
                var conn = this.plugin.conn_get(this.connection,
                    'localhost', 25, 0);
                this.connection.server.notes.conn_pool = {}
                this.connection.server.notes.conn_pool[conn.pool_name] = [ conn ];
                this.plugin.conn_get(this.connection, 'localhost', 25, 0);
                test.ok(this.connection.notes.conn.pool_connection);
            }
            catch (err) {
                console.log(err.stack);
            }

            test.done();
        },
    'conn_get should set connection.server.notes.active_conections' :
        function (test) {
            test.expect(4);

            try {
                this.plugin.conn_get(this.connection, 'localhost', 25, 0);
                test.isNumber(this.connection.server.notes.active_conections);
                test.equals(this.connection.server.notes.active_conections, 1);
                this.plugin.conn_get(this.connection, 'localhost', 25, 0);
                test.isNumber(this.connection.server.notes.active_conections);
                test.equals(this.connection.server.notes.active_conections, 2);
            }
            catch (err) {
                console.log(err.stack);
            }

            test.done();
        },
    'conn_get should return conn == connection.notes.conn' : function (test) {
        test.expect(3);

        try {
            var conn = this.plugin.conn_get(this.connection, 'localhost', 25, 0);
            test.isObject(conn);
            test.isObject(this.connection.notes.conn);
            test.equals(conn, this.connection.notes.conn);
        }
        catch (err) {
            console.log(err.stack);
        }

        test.done();
    },
    'conn_get should call socket.removeAllListeners()' : function (test) {
        test.expect(7);

        try {
            var conn = this.plugin.conn_get(this.connection, 'localhost', 25, 0);
            this.plugin.conn_idle(this.connection);
            conn = this.plugin.conn_get(this.connection, 'localhost', 25, 0);
            test.ok(
                this.connection.notes.conn.socket.removeAllListeners.called);
            test.equals(conn.socket.removeAllListeners.args[0][0], 'error');
            test.equals(conn.socket.removeAllListeners.args[1][0], 'timeout');
            test.equals(conn.socket.removeAllListeners.args[2][0], 'close');
            test.equals(conn.socket.removeAllListeners.args[3][0], 'connect');
            test.equals(conn.socket.removeAllListeners.args[4][0], 'line');
            test.equals(conn.socket.removeAllListeners.args[5][0], 'drain');
        }
        catch (err) {
            console.log(err.stack);
        }

        test.done();
    },
    'conn_get should use conn_pool correctly' : function (test) {
        test.expect(2);

        try {
            var conn = this.plugin.conn_get(this.connection, 'localhost', 25, 0);
            this.plugin.conn_idle(this.connection);
            test.equals(this.connection.server.notes.conn_pool[conn.pool_name].length, 1);
            conn = this.plugin.conn_get(this.connection, 'localhost', 25, 0);
            test.equals(this.connection.server.notes.conn_pool[conn.pool_name].length, 0);
        }
        catch (err) {
            console.log(err.stack);
        }

        test.done();
    },
    'conn_get should listen for error event' : function (test) {
        test.expect(7);

        try {
            var conn = this.plugin.conn_get(this.connection, 'localhost', 25, 0);
            this.plugin.conn_idle(this.connection);
            conn = this.plugin.conn_get(this.connection, 'localhost', 25, 0);
            test.ok(this.connection.notes.conn.socket.on.called);
            test.equals(conn.socket.on.args[0][0], 'error');
            test.equals(conn.socket.on.args[1][0], 'timeout');
            test.equals(conn.socket.on.args[2][0], 'close');
            test.isFunction(conn.socket.on.args[0][1]);
            test.isFunction(conn.socket.on.args[1][1]);
            test.isFunction(conn.socket.on.args[2][1]);
        }
        catch (err) {
            console.log(err.stack);
        }

        test.done();
    },
    'should have conn_destroy function' : function (test) {
        test.expect(2);
        test.isNotNull(this.plugin);
        test.isFunction(this.plugin.conn_destroy);
        test.done();
    },
    'conn_destroy should throw with missing argument 0' : function (test) {
        test.expect(2);

        try {
            this.plugin.conn_destroy(null, this.connection.notes.conn);
        }
        catch (err) {
            test.isNotNull(err);
            test.equals(err.message, "Invalid Arguments");
        }

        test.done();
    },
    'conn_destroy should throw with missing argument 1' : function (test) {
        test.expect(2);

        try {
            this.plugin.conn_destroy(this.connection, null);
        }
        catch (err) {
            test.isNotNull(err);
            test.equals(err.message, "Invalid Arguments");
        }

        test.done();
    },
    'conn_destroy should call socket.destroySoon()' : function (test) {
        test.expect(1);

        try {
            var conn = this.plugin.conn_get(this.connection, 'localhost', 25, 0);
            var testSocket = conn.socket;
            this.plugin.conn_destroy(this.connection, conn);
            test.ok(testSocket.destroySoon.called);
        }
        catch (err) {
            console.log(err.stack);
        }

        test.done();
    },
    'conn_destroy should set conn.socket to 0' : function (test) {
        test.expect(1);

        try {
            var conn = this.plugin.conn_get(this.connection, 'localhost', 25, 0);
            this.plugin.conn_destroy(this.connection, conn);
            test.equals(conn.socket, 0);
        }
        catch (err) {
            console.log(err.stack);
        }

        test.done();
    },
    'conn_destroy should unlink connection.notes.conn' : function (test) {
        test.expect(1);

        try {
            var conn = this.plugin.conn_get(this.connection, 'localhost', 25, 0);
            this.plugin.conn_destroy(this.connection, conn);
            test.isUndefined(this.connection.notes.conn);
        }
        catch (err) {
            console.log(err.stack);
        }

        test.done();
    },
    'conn_destroy should decrement active_conections' : function (test) {
        test.expect(14);

        try {
            var conn = this.plugin.conn_get(this.connection, 'localhost', 25, 0);
            test.isNumber(this.connection.server.notes.active_conections);
            test.equals(this.connection.server.notes.active_conections, 1);

            this.plugin.conn_destroy(this.connection, conn);
            test.isNumber(this.connection.server.notes.active_conections);
            test.equals(this.connection.server.notes.active_conections, 0);

            conn = this.plugin.conn_get(this.connection, 'localhost', 25, 0);
            test.isNumber(this.connection.server.notes.active_conections);
            test.equals(this.connection.server.notes.active_conections, 1);

            var conn2 = this.plugin.conn_get(this.connection, 'localhost', 25, 0);
            test.isNumber(this.connection.server.notes.active_conections);
            test.equals(this.connection.server.notes.active_conections, 2);

            this.plugin.conn_destroy(this.connection, conn);
            test.isNumber(this.connection.server.notes.active_conections);
            test.equals(this.connection.server.notes.active_conections, 1);

            this.plugin.conn_destroy(this.connection, conn);
            test.isNumber(this.connection.server.notes.active_conections);
            test.equals(this.connection.server.notes.active_conections, 1);

            this.plugin.conn_destroy(this.connection, conn2);
            test.isNumber(this.connection.server.notes.active_conections);
            test.equals(this.connection.server.notes.active_conections, 0);
        }
        catch (err) {
            console.log(err.stack);
        }

        test.done();
    },
    'conn_destroy should not have a conn_pool for actives' : function (test) {
        test.expect(2);

        try {
            var conn = this.plugin.conn_get(this.connection, 'localhost', 25, 0);
            test.isUndefined(this.connection.server.notes.conn_pool);
            this.plugin.conn_destroy(this.connection, conn);
            test.isUndefined(this.connection.server.notes.conn_pool);
        }
        catch (err) {
            console.log(err.stack);
        }

        test.done();
    },
    'should have conn_idle function' : function (test) {
        test.expect(2);
        test.isNotNull(this.plugin);
        test.isFunction(this.plugin.conn_idle);
        test.done();
    },
    'conn_idle should throw with missing argument 0' : function (test) {
        test.expect(2);

        try {
            this.plugin.conn_idle(null);
        }
        catch (err) {
            test.isNotNull(err);
            test.equals(err.message, "Invalid Arguments");
        }

        test.done();
    },
    'conn_idle should return on null connection.notes.conn' : function (test) {
        try {
            test.expect(2);
            test.isUndefined(this.connection.notes.conn);
            this.plugin.conn_idle(this.connection);
            test.isUndefined(this.connection.server.notes.conn_pool);
        }
        catch (err) {
            console.log(err.stack);
        }

        test.done();
    },
    'conn_idle should put conn in conn_pool' : function (test) {
        try {
            test.expect(8);
            test.isUndefined(this.connection.notes.conn);
            var conn = this.plugin.conn_get(this.connection, 'localhost', 25, 0);
            test.isNotUndefined(this.connection.notes.conn);
            test.isUndefined(this.connection.server.notes.conn_pool);
            this.plugin.conn_idle(this.connection);
            test.isUndefined(this.connection.notes.conn);
            test.isNotUndefined(this.connection.server.notes.conn_pool[conn.pool_name]);
            test.isArray(this.connection.server.notes.conn_pool[conn.pool_name]);
            test.equals(this.connection.server.notes.conn_pool[conn.pool_name].length, 1);
            test.deepEqual(this.connection.server.notes.conn_pool[conn.pool_name][0],
                conn);
        }
        catch (err) {
            console.log(err.stack);
        }

        test.done();
    },
    'conn_idle should put multiple conns in conn_pool' : function (test) {
        try {
            test.expect(15);
            test.isUndefined(this.connection.notes.conn);
            var conn = this.plugin.conn_get(this.connection, 'localhost', 25, 0);
            test.isNotUndefined(this.connection.notes.conn);
            test.isUndefined(this.connection.server.notes.conn_pool);
            var conn2 = this.plugin.conn_get(this.connection, 'localhost', 25, 0);
            test.isNotUndefined(this.connection.notes.conn);
            test.isUndefined(this.connection.server.notes.conn_pool);

            this.plugin.conn_idle(this.connection);
            test.isUndefined(this.connection.notes.conn);
            test.isNotUndefined(this.connection.server.notes.conn_pool[conn.pool_name]);
            test.isArray(this.connection.server.notes.conn_pool[conn.pool_name]);
            test.equals(this.connection.server.notes.conn_pool[conn.pool_name].length, 1);
            test.deepEqual(this.connection.server.notes.conn_pool[conn.pool_name][0],
                conn2);

            this.connection.notes.conn = conn;
            this.plugin.conn_idle(this.connection);
            test.isUndefined(this.connection.notes.conn);
            test.isNotUndefined(this.connection.server.notes.conn_pool[conn.pool_name]);
            test.isArray(this.connection.server.notes.conn_pool[conn.pool_name]);
            test.equals(this.connection.server.notes.conn_pool[conn.pool_name].length, 2);
            test.deepEqual(this.connection.server.notes.conn_pool[conn.pool_name][1],
                conn);
        }
        catch (err) {
            console.log(err.stack);
        }

        test.done();
    },
    'conn_idle should put multiple conns in conn_pool' : function (test) {
        try {
            test.expect(15);
            test.isUndefined(this.connection.notes.conn);
            var conn = this.plugin.conn_get(this.connection, 'localhost', 25, 0);
            test.isNotUndefined(this.connection.notes.conn);
            test.isUndefined(this.connection.server.notes.conn_pool);
            var conn2 = this.plugin.conn_get(this.connection, 'localhost', 25, 0);
            test.isNotUndefined(this.connection.notes.conn);
            test.isUndefined(this.connection.server.notes.conn_pool);

            this.plugin.conn_idle(this.connection);
            test.isUndefined(this.connection.notes.conn);
            test.isNotUndefined(this.connection.server.notes.conn_pool[conn.pool_name]);
            test.isArray(this.connection.server.notes.conn_pool[conn.pool_name]);
            test.equals(this.connection.server.notes.conn_pool[conn.pool_name].length, 1);
            test.deepEqual(this.connection.server.notes.conn_pool[conn.pool_name][0],
                conn2);

            this.connection.notes.conn = conn;
            this.plugin.conn_idle(this.connection);
            test.isUndefined(this.connection.notes.conn);
            test.isNotUndefined(this.connection.server.notes.conn_pool[conn.pool_name]);
            test.isArray(this.connection.server.notes.conn_pool[conn.pool_name]);
            test.equals(this.connection.server.notes.conn_pool[conn.pool_name].length, 2);
            test.deepEqual(this.connection.server.notes.conn_pool[conn.pool_name][1],
                conn);
        }
        catch (err) {
            console.log(err.stack);
        }

        test.done();
    },
    'conn_idle should remove active_conections count' : function (test) {
        try {
            test.expect(7);
            test.isUndefined(this.connection.server.notes.active_conections);
            var conn = this.plugin.conn_get(this.connection, 'localhost', 25, 0);
            test.isNotUndefined(this.connection.server.notes.active_conections);
            test.isNumber(this.connection.server.notes.active_conections);
            test.equals(this.connection.server.notes.active_conections, 1);
            this.plugin.conn_idle(this.connection);
            test.isNotUndefined(this.connection.server.notes.active_conections);
            test.isNumber(this.connection.server.notes.active_conections);
            test.equals(this.connection.server.notes.active_conections, 0);
        }
        catch (err) {
            console.log(err.stack);
        }

        test.done();
    }
};
