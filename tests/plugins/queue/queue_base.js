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
    'should throw with missing argument 0' : function (test) {
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
    'should throw with missing argument 1' : function (test) {
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
    'should throw with missing argument 2' : function (test) {
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
    'should set connection.notes.conn' : function (test) {
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
    'should set connection.notes.conn.socket' : function (test) {
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
    'should call connection.notes.conn.socket.setTimeout' : function (test) {
        test.expect(2);

        try {
            this.plugin.get_conn(this, this.next, this.connection,
                'localhost', 25, 666);
            test.ok(this.connection.notes.conn.socket.setTimeout.called);
            test.equals(this.connection.notes.conn.socket.setTimeout.args[0],
                1000 * 666);
        }
        catch (err) {
            console.log(err.stack);
        }

        test.done();
    },
    'should set connection.notes.conn.pool_connection false' : function (test) {
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
    'should set connection.notes.conn.pool_connection true' : function (test) {
        test.expect(1);

        try {
            var socket = this.plugin.get_conn(this, this.next, this.connection,
                'localhost', 25, 0);
            this.connection.server.notes.conn_pool = [ socket ];
            this.plugin.get_conn(this, this.next, this.connection,
                'localhost', 25, 0);
            test.ok(this.connection.notes.conn.pool_connection);
        }
        catch (err) {
            console.log(err.stack);
        }

        test.done();
    },
    'should set connection.server.notes.active_conections' : function (test) {
        test.expect(2);

        try {
            this.plugin.get_conn(this, this.next, this.connection,
                'localhost', 25, 0);
            test.isNumber(this.connection.server.notes.active_conections);
            test.equals(this.connection.server.notes.active_conections, 1);
        }
        catch (err) {
            console.log(err.stack);
        }

        test.done();
    },
    'should return conn that equals connection.notes.conn' : function (test) {
        test.expect(3);

        try {
            var socket = this.plugin.get_conn(this, this.next, this.connection,
                'localhost', 25, 0);
            test.isObject(socket);
            test.isObject(this.connection.notes.conn);
            test.equals(socket, this.connection.notes.conn);
        }
        catch (err) {
            console.log(err.stack);
        }

        test.done();
    },
    'should set connection.notes.conn.next to next' : function (test) {
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
    'should call socket.removeAllListeners()' : function (test) {
        test.expect(7);

        try {
            var socket = this.plugin.get_conn(this, this.next, this.connection,
                'localhost', 25, 0);
            this.connection.server.notes.conn_pool = [ socket ];
            socket = this.plugin.get_conn(this, this.next, this.connection,
                'localhost', 25, 0);
            test.ok(
                this.connection.notes.conn.socket.removeAllListeners.called);
            test.equals(socket.socket.removeAllListeners.args[0][0], 'error');
            test.equals(socket.socket.removeAllListeners.args[1][0], 'timeout');
            test.equals(socket.socket.removeAllListeners.args[2][0], 'close');
            test.equals(socket.socket.removeAllListeners.args[3][0], 'connect');
            test.equals(socket.socket.removeAllListeners.args[4][0], 'line');
            test.equals(socket.socket.removeAllListeners.args[5][0], 'drain');
        }
        catch (err) {
            console.log(err.stack);
        }

        test.done();
    },
    'should call socket.removeAllListeners()' : function (test) {
        test.expect(7);

        try {
            var socket = this.plugin.get_conn(this, this.next, this.connection,
                'localhost', 25, 0);
            this.connection.server.notes.conn_pool = [ socket ];
            socket = this.plugin.get_conn(this, this.next, this.connection,
                'localhost', 25, 0);
            test.ok(
                this.connection.notes.conn.socket.removeAllListeners.called);
            test.equals(socket.socket.removeAllListeners.args[0][0], 'error');
            test.equals(socket.socket.removeAllListeners.args[1][0], 'timeout');
            test.equals(socket.socket.removeAllListeners.args[2][0], 'close');
            test.equals(socket.socket.removeAllListeners.args[3][0], 'connect');
            test.equals(socket.socket.removeAllListeners.args[4][0], 'line');
            test.equals(socket.socket.removeAllListeners.args[5][0], 'drain');
        }
        catch (err) {
            console.log(err.stack);
        }

        test.done();
    },
    'should call socket.removeAllListeners()' : function (test) {
        test.expect(2);

        try {
            var socket = this.plugin.get_conn(this, this.next, this.connection,
                'localhost', 25, 0);
            this.connection.server.notes.conn_pool = [ socket ];
            test.equals(this.connection.server.notes.conn_pool.length, 1);
            socket = this.plugin.get_conn(this, this.next, this.connection,
                'localhost', 25, 0);
            test.equals(this.connection.server.notes.conn_pool.length, 0);
        }
        catch (err) {
            console.log(err.stack);
        }

        test.done();
    }
};
