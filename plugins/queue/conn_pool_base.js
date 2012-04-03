// Base queue plugin.
// This cannot be used on its own. You need to inherit from it.
// See plugins/queue/smtp_forward.js for an example.

var sock = require('./line_socket');

// XXX: auto-register event handlers
exports.conn_get = function (connection, host, port, timeout) {
    var conn = {};
    host = (host) ? host : 'localhost';
    port = (port) ? port : 25;
    timeout = (timeout || timeout == 0) ? timeout : 300;
    conn.pool_name = host + ':' + port + ':' + timeout;

    if (!connection) {
        throw new Error("Invalid Arguments");
    }

    if (connection.server.notes.conn_pool &&
        connection.server.notes.conn_pool[conn.pool_name] &&
        connection.server.notes.conn_pool[conn.pool_name].length) {
        connection.logdebug(this, "using connection from the pool: (" +
            connection.server.notes.conn_pool[conn.pool_name].length + ")");

        conn = connection.server.notes.conn_pool[conn.pool_name].shift();

        // We should just reset these things when we shift a connection off
        // since we have to setup stuff based on _this_ connection.
        conn.pool_connection = true;

        // Cleanup all old event listeners
        // Note, if new ones are added in the caller, please remove them here.
        conn.socket.removeAllListeners('error');
        conn.socket.removeAllListeners('timeout');
        conn.socket.removeAllListeners('close');
        conn.socket.removeAllListeners('connect');
        conn.socket.removeAllListeners('line');
        conn.socket.removeAllListeners('drain');

        var self = this;
        conn.socket.on('error', function (err) {
            this.conn_destroy(self, connection, conn);
        });

        conn.socket.on('timeout', function () {
            this.conn_destroy(self, connection, conn);
        });

        conn.socket.on('close', function (had_error) {
            this.conn_destroy(self, connection, conn);
        });
    }
    else {
        conn.socket = sock.connect(port, host);
        conn.socket.setTimeout(timeout * 1000);

        // XXX: This socket.connect should be handled in smtp_proxy and in
        // smtp_forward
        conn.socket.command = 'connect';
        conn.pool_connection = false;
    }

    connection.notes.conn = conn;

    if (connection.server.notes.active_conections >= 0) {
        connection.server.notes.active_conections++;
    }
    else {
        connection.server.notes.active_conections = 1;
    }

    connection.logdebug(this, "active connections: (" +
        connection.server.notes.active_conections + ")");

    return conn;
}

// function will destroy an conn and pull it out of the idle array
exports.conn_destroy = function (connection, conn) {
    var reset_active_connections = 0;

    if (!connection || !conn) {
        throw new Error("Invalid Arguments");
    }

    if (conn && conn.socket) {
        connection.logdebug(this, "destroying connection");
        conn.socket.destroySoon();
        conn.socket = 0;
        reset_active_connections = 1;
    }

    // Unlink the connection from the proxy just in case we got here
    // without that happening already.
    if (connection && connection.notes.conn) {
        delete connection.notes.conn;
    }

    if (connection.server.notes.conn_pool &&
        connection.server.notes.conn_pool[conn.pool_name]) {
        // Pull that conn from the proxy pool.
        // Note we do not do this operation that often.
        var index = connection.server.notes.conn_pool[conn.pool_name].indexOf(conn);
        if (index != -1) {
            // if we are pulling something from the proxy pool, it is not
            // acttive.  This means we do not want to reset it.
            reset_active_connections = 0;
            connection.server.notes.conn_pool[conn.pool_name].splice(index, 1);
            connection.logdebug(this, "pulling dead connection from pool: (" +
                connection.server.notes.conn_pool[conn.pool_name].length + ")");
        }
    }

    if (reset_active_connections &&
        connection.server.notes.active_conections) {
        connection.server.notes.active_conections--;
        connection.logdebug(this, "active connections: (" +
            connection.server.notes.active_conections + ")");
    }

    return;
}

exports.conn_idle = function (connection) {
    if (!connection) {
        throw new Error("Invalid Arguments");
    }

    var conn = connection.notes.conn;

    if (!(conn)) {
        return;
    }

    if (connection.server.notes.conn_pool) {
        if (connection.server.notes.conn_pool[conn.pool_name]) {
            connection.server.notes.conn_pool[conn.pool_name].push(conn);
        }
        else {
            connection.server.notes.conn_pool[conn.pool_name] = [ conn ];
        }
    }
    else {
        connection.server.notes.conn_pool = {}
        connection.server.notes.conn_pool[conn.pool_name] = [ conn ];
    }

    connection.server.notes.active_conections--;

    connection.logdebug(this, "putting connection back in pool: (" +
        connection.server.notes.conn_pool[conn.pool_name].length + ")");
    connection.logdebug(this, "active connections: (" +
        connection.server.notes.active_conections + ")");

    // Unlink this connection from the proxy now that it is back
    // in the pool.
    if (connection && connection.notes.conn) {
        delete connection.notes.conn;
    }

    return;
}
