var stub             = require('tests/fixtures/stub'),
    constants        = require('../../../constants'),
    Connection       = require('tests/fixtures/stub_connection'),
    Plugin           = require('tests/fixtures/stub_plugin');

// huge hack here, but plugin tests need constants
constants.import(global);

function _set_up(callback) {
    this.backup = {};

    // needed for tests
    this.plugin = new Plugin('plugins/queue/queue_base');
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

exports.queue_base = {
    setUp : _set_up,
    tearDown : _tear_down,
    'should have get_conn function' : function (test) {
        test.expect(2);
        test.isNotNull(this.plugin);
        test.isFunction(this.plugin.get_conn);
        test.done();
    },
    'get_conn should throw with missing argument 0' : function (test) {
        test.expect(2);

        try {
            this.plugin.get_conn(null, this.next, this.connection,
                'localhost', 25, 0);
        }
        catch (err) {
            test.isNotNull(err);
            test.equals(err.message, "Invalid Arguments");
        }

        test.done();
    },
    'get_conn should throw with missing argument 1' : function (test) {
        test.expect(2);

        try {
            this.plugin.get_conn(this, null, this.connection,
                'localhost', 25, 0);
        }
        catch (err) {
            test.isNotNull(err);
            test.equals(err.message, "Invalid Arguments");
        }

        test.done();
    },
    'get_conn should throw with missing argument 2' : function (test) {
        test.expect(2);

        try {
            this.plugin.get_conn(this, this.next, null,
                'localhost', 25, 0);
        }
        catch (err) {
            test.isNotNull(err);
            test.equals(err.message, "Invalid Arguments");
        }

        test.done();
    },
    'get_conn should set connection.notes.conn' : function (test) {
        test.expect(2);

        try {
            this.plugin.get_conn(this, this.next, this.connection,
                'localhost', 25, 0);
            test.isNotUndefined(this.connection.notes.conn);
            test.isNotNull(this.connection.notes.conn);
        }
        catch (err) {
            console.log(err.stack);
        }

        test.done();
    },
    'get_conn should set connection.notes.conn.socket' : function (test) {
        test.expect(3);

        try {
            this.plugin.get_conn(this, this.next, this.connection,
                'localhost', 25, 0);
            test.isNotUndefined(this.connection.notes.conn.socket);
            test.isNotNull(this.connection.notes.conn.socket);
            test.isObject(this.connection.notes.conn.socket);
        }
        catch (err) {
            console.log(err.stack);
        }

        test.done();
    },
    'get_conn should call connection.notes.conn.socket.setTimeout' :
        function (test) {
            test.expect(2);
    
            try {
                this.plugin.get_conn(this, this.next, this.connection,
                    'localhost', 25, 666);
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
    'get_conn should set connection.notes.conn.pool_connection false' :
        function (test) {
            test.expect(1);

            try {
                this.plugin.get_conn(this, this.next, this.connection,
                    'localhost', 25, 0);
                test.ok(!this.connection.notes.conn.pool_connection);
            }
            catch (err) {
                console.log(err.stack);
            }

            test.done();
        },
    'get_conn should set connection.notes.conn.pool_connection true' :
        function (test) {
            test.expect(1);

            try {
                var conn = this.plugin.get_conn(this, this.next,
                    this.connection, 'localhost', 25, 0);
                this.connection.server.notes.conn_pool = [ conn ];
                this.plugin.get_conn(this, this.next, this.connection,
                    'localhost', 25, 0);
                test.ok(this.connection.notes.conn.pool_connection);
            }
            catch (err) {
                console.log(err.stack);
            }

            test.done();
        },
    'get_conn should set connection.server.notes.active_conections' :
        function (test) {
            test.expect(4);

            try {
                this.plugin.get_conn(this, this.next, this.connection,
                    'localhost', 25, 0);
                test.isNumber(this.connection.server.notes.active_conections);
                test.equals(this.connection.server.notes.active_conections, 1);
                this.plugin.get_conn(this, this.next, this.connection,
                    'localhost', 25, 0);
                test.isNumber(this.connection.server.notes.active_conections);
                test.equals(this.connection.server.notes.active_conections, 2);
            }
            catch (err) {
                console.log(err.stack);
            }

            test.done();
        },
    'get_conn should return conn == connection.notes.conn' : function (test) {
        test.expect(3);

        try {
            var conn = this.plugin.get_conn(this, this.next, this.connection,
                'localhost', 25, 0);
            test.isObject(conn);
            test.isObject(this.connection.notes.conn);
            test.equals(conn, this.connection.notes.conn);
        }
        catch (err) {
            console.log(err.stack);
        }

        test.done();
    },
    'get_conn should set connection.notes.conn.next to next' : function (test) {
        test.expect(3);

        try {
            this.plugin.get_conn(this, this.next, this.connection,
                'localhost', 25, 0);
            test.isNotNull(this.connection.notes.conn.next);
            test.isFunction(this.connection.notes.conn.next);
            test.equals(this.next, this.connection.notes.conn.next);
        }
        catch (err) {
            console.log(err.stack);
        }

        test.done();
    },
    'get_conn should call socket.removeAllListeners()' : function (test) {
        test.expect(7);

        try {
            var conn = this.plugin.get_conn(this, this.next, this.connection,
                'localhost', 25, 0);
            this.connection.server.notes.conn_pool = [ conn ];
            conn = this.plugin.get_conn(this, this.next, this.connection,
                'localhost', 25, 0);
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
    'get_conn should call socket.removeAllListeners()' : function (test) {
        test.expect(7);

        try {
            var conn = this.plugin.get_conn(this, this.next, this.connection,
                'localhost', 25, 0);
            this.connection.server.notes.conn_pool = [ conn ];
            conn = this.plugin.get_conn(this, this.next, this.connection,
                'localhost', 25, 0);
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
    'get_conn should call socket.removeAllListeners()' : function (test) {
        test.expect(2);

        try {
            var conn = this.plugin.get_conn(this, this.next, this.connection,
                'localhost', 25, 0);
            this.connection.server.notes.conn_pool = [ conn ];
            test.equals(this.connection.server.notes.conn_pool.length, 1);
            conn = this.plugin.get_conn(this, this.next, this.connection,
                'localhost', 25, 0);
            test.equals(this.connection.server.notes.conn_pool.length, 0);
        }
        catch (err) {
            console.log(err.stack);
        }

        test.done();
    },
    'should have destroy_conn function' : function (test) {
        test.expect(2);
        test.isNotNull(this.plugin);
        test.isFunction(this.plugin.destroy_conn);
        test.done();
    },
    'destroy_conn should throw with missing argument 0' : function (test) {
        test.expect(2);

        try {
            this.plugin.destroy_conn(null, this.connection,
                this.connection.notes.conn);
        }
        catch (err) {
            test.isNotNull(err);
            test.equals(err.message, "Invalid Arguments");
        }

        test.done();
    },
    'destroy_conn should throw with missing argument 1' : function (test) {
        test.expect(2);

        try {
            this.plugin.destroy_conn(this, null, this.connection.notes.conn);
        }
        catch (err) {
            test.isNotNull(err);
            test.equals(err.message, "Invalid Arguments");
        }

        test.done();
    },
    'destroy_conn should throw with missing argument 2' : function (test) {
        test.expect(2);

        try {
            this.plugin.destroy_conn(this, this.connection, null);
        }
        catch (err) {
            test.isNotNull(err);
            test.equals(err.message, "Invalid Arguments");
        }

        test.done();
    },
    'destroy_conn should call socket.destroySoon()' : function (test) {
        test.expect(1);

        try {
            var conn = this.plugin.get_conn(this, this.next, this.connection,
                'localhost', 25, 0);
            var testSocket = conn.socket;
            this.plugin.destroy_conn(this, this.connection, conn);
            test.ok(testSocket.destroySoon.called);
        }
        catch (err) {
            console.log(err.stack);
        }

        test.done();
    },
    'destroy_conn should set conn.socket to 0' : function (test) {
        test.expect(1);

        try {
            var conn = this.plugin.get_conn(this, this.next, this.connection,
                'localhost', 25, 0);
            this.plugin.destroy_conn(this, this.connection, conn);
            test.equals(conn.socket, 0);
        }
        catch (err) {
            console.log(err.stack);
        }

        test.done();
    },
    'destroy_conn should unlink connection.notes.conn' : function (test) {
        test.expect(1);

        try {
            var conn = this.plugin.get_conn(this, this.next, this.connection,
                'localhost', 25, 0);
            this.plugin.destroy_conn(this, this.connection, conn);
            test.isUndefined(this.connection.notes.conn);
        }
        catch (err) {
            console.log(err.stack);
        }

        test.done();
    },
    'destroy_conn should decrement active_conections' : function (test) {
        test.expect(14);

        try {
            var conn = this.plugin.get_conn(this, this.next, this.connection,
                'localhost', 25, 0);
            test.isNumber(this.connection.server.notes.active_conections);
            test.equals(this.connection.server.notes.active_conections, 1);

            this.plugin.destroy_conn(this, this.connection, conn);
            test.isNumber(this.connection.server.notes.active_conections);
            test.equals(this.connection.server.notes.active_conections, 0);

            conn = this.plugin.get_conn(this, this.next, this.connection,
                'localhost', 25, 0);
            test.isNumber(this.connection.server.notes.active_conections);
            test.equals(this.connection.server.notes.active_conections, 1);

            var conn2 = this.plugin.get_conn(this, this.next, this.connection,
                'localhost', 25, 0);
            test.isNumber(this.connection.server.notes.active_conections);
            test.equals(this.connection.server.notes.active_conections, 2);

            this.plugin.destroy_conn(this, this.connection, conn);
            test.isNumber(this.connection.server.notes.active_conections);
            test.equals(this.connection.server.notes.active_conections, 1);

            this.plugin.destroy_conn(this, this.connection, conn);
            test.isNumber(this.connection.server.notes.active_conections);
            test.equals(this.connection.server.notes.active_conections, 1);

            this.plugin.destroy_conn(this, this.connection, conn2);
            test.isNumber(this.connection.server.notes.active_conections);
            test.equals(this.connection.server.notes.active_conections, 0);
        }
        catch (err) {
            console.log(err.stack);
        }

        test.done();
    },
    'destroy_conn should not have a conn_pool for actives' : function (test) {
        test.expect(2);

        try {
            var conn = this.plugin.get_conn(this, this.next, this.connection,
                'localhost', 25, 0);
            test.isUndefined(this.connection.server.notes.conn_pool);
            this.plugin.destroy_conn(this, this.connection, conn);
            test.isUndefined(this.connection.server.notes.conn_pool);
        }
        catch (err) {
            console.log(err.stack);
        }

        test.done();
    }
};
