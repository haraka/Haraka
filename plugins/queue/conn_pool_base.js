// Base queue plugin.
// This cannot be used on its own. You need to inherit from it.
// See plugins/queue/smtp_forward.js for an example.

var sock = require('./line_socket');
var smtp_regexp = /^([0-9]{3})([ -])(.*)/;

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
            self.conn_destroy(connection, conn);
        });

        conn.socket.on('timeout', function () {
            self.conn_destroy(connection, conn);
        });

        conn.socket.on('close', function (had_error) {
            self.conn_destroy(connection, conn);
        });
    }
    else {
        conn.socket = sock.connect(port, host);
        conn.socket.setTimeout(timeout * 1000);
        conn.pool_connection = false;
    }

    conn.response = [];
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

exports.smtp_conn_get = function (connection, host, port, timeout, enable_tls) {
    var smtp_conn = this.conn_get(connection, host, port, timeout);
    smtp_conn.data_marker = 0;
    smtp_conn.dot_pending = true;
    smtp_conn.response = []
    smtp_conn.command = 'connect';
    var self = this;

    smtp_conn.send_data = function () {
        while (smtp_conn.data_marker < connection.transaction.data_lines.length) {
            var line = connection.transaction.data_lines[smtp_conn.data_marker];
            smtp_conn.data_marker++;
            var wrote_all = smtp_conn.socket.write(line.replace(/^\./, '..').replace(/\r?\n/g, '\r\n'));
            if (!wrote_all) return;
        }
        // we get here if wrote_all still true, and we got to end of data_lines
        if (smtp_conn.dot_pending) {
            smtp_conn.dot_pending = false;
            smtp_conn.send_command('dot');
        }
    }

    smtp_conn.send_command = function (cmd, data) {
        var line = cmd + (data ? (' ' + data) : '');
        if (cmd === 'dot') {
            line = '.';
        }
        connection.logprotocol(self, "C: " + line);
        smtp_conn.command = cmd.toLowerCase();
        smtp_conn.response = [];
        smtp_conn.socket.write(line + "\r\n");
    };

    smtp_conn.reset = function () {
        smtp_conn.socket.removeAllListeners('line');
        smtp_conn.socket.on('line', function (line) {
            var matches = smtp_regexp.exec(line);
            if (!matches) {
                connection.logerror(self, "Unrecognised response from upstream server: " + line);
                smtp_conn.socket.end();
                return;
            }

            var code = matches[1], cont = matches[2];
            if (cont !== ' ') {
                return;
            }

            if (code.match(/^[45]/)) {
                smtp_conn.socket.end();
                return;
            }
            self.conn_idle(connection);
        });
        smtp_conn.send_command('RSET');
    };

    smtp_conn.call_next = function (retval, msg) {
        if (smtp_conn.next) {
            smtp_conn.next(retval, msg);
            smtp_conn.next = undefined;
        }
    };

    smtp_conn.start = function () {
        if (smtp_conn.pool_connection) {
            if (smtp_conn.xclient) {
                smtp_conn.send_command('XCLIENT', 'ADDR=' + connection.remote_ip);
            }
            else {
                smtp_conn.send_command('MAIL', 'FROM:' + connection.transaction.mail_from);
            }
        }
    };

    smtp_conn.socket.on('drain', function() {
        if (smtp_conn.dot_pending && smtp_conn.command === 'mailbody') {
            process.nextTick(function () { smtp_conn.send_data() });
        }
    });

    smtp_conn.socket.on('error', function (err) {
        connection.logdebug(self, "Ongoing connection failed: " + err);
        smtp_conn.call_next();
    });

    smtp_conn.socket.on('timeout', function () {
        connection.logdebug(self, "Ongoing connection timed out");
        smtp_conn.call_next();
    });

    smtp_conn.socket.on('close', function (had_error) {
        connection.logdebug(self, "Ongoing connection closed");
    });

    smtp_conn.socket.on('connect', function () {
        connection.logdebug(self, "Ongoing connection established");
    });

    smtp_conn.socket.on('line', function (line) {
        connection.logprotocol(self, "S: " + line);
        var matches = smtp_regexp.exec(line);
        if (!matches) {
            connection.logerror(self, "Unrecognised response from upstream server: " + line);
            smtp_conn.socket.end();
            return smtp_conn.call_next();
        }

        var code = matches[1],
            cont = matches[2],
            rest = matches[3];
        smtp_conn.response.push(rest);
        if (cont !== ' ') {
            return;
        }

        if (smtp_conn.command === 'ehlo') {
            if (code.match(/^5/)) {
                // Handle fallback to HELO if EHLO is rejected
                if (smtp_conn.xclient) {
                    smtp_conn.send_command('HELO', connection.hello_host);
                }
                else {
                    smtp_conn.send_command('HELO', self.config.get('me'));
                }
                return;
            }
            // Parse CAPABILITIES
            for (var i in smtp_conn.response) {
                if (smtp_conn.response[i].match(/^XCLIENT/)) {
                    if(!smtp_conn.xclient) {
                        // Just use the ADDR= key for now
                        smtp_conn.send_command('XCLIENT', 'ADDR=' + connection.remote_ip);
                        return;
                    }
                }
                if (smtp_conn.response[i].match(/^STARTTLS/)) {
                    var key = self.config.get('tls_key.pem', 'data').join("\n");
                    var cert = self.config.get('tls_cert.pem', 'data').join("\n");
                    if (key && cert && (!/(true|yes|1)/i.exec(enable_tls))) {
                        smtp_conn.socket.on('secure', function () {
                            smtp_conn.send_command('EHLO', self.config.get('me'));
                        });
                        smtp_conn.send_command('STARTTLS');
                        return;
                    }
                }
            }
        }
        if (smtp_conn.command === 'xclient' && code.match(/^5/)) {
            // XCLIENT command was rejected (no permission?)
            // Carry on without XCLIENT
            smtp_conn.command = 'helo';
        }
        else if (code.match(/^[45]/)) {
            if (!smtp_conn.on_error(code)) {
                return;
            }
        }
        switch (smtp_conn.command) {
            case 'xclient':
                smtp_conn.xclient = true;
                smtp_conn.send_command('EHLO', connection.hello_host);
                break;
            case 'starttls':
                var tls_options = { key: key, cert: cert };
                smtp_conn.socket.upgrade(tls_options);
                break;
            case 'connect':
                smtp_conn.send_command('EHLO', self.config.get('me'));
                break;
            case 'ehlo':
            case 'helo':
                smtp_conn.send_command('MAIL', 'FROM:' + connection.transaction.mail_from);
                break;
            case 'mail':
                smtp_conn.on_mail();
                break;
            case 'rcpt':
                smtp_conn.on_rcpt();
                break;
            case 'data':
                smtp_conn.on_data();
                break;
            case 'dot':
                // Return the response from the server back to the client
                // but add in our transaction UUID at the end of the line.
                smtp_conn.call_next(OK, smtp_conn.response + ' (' + connection.transaction.uuid + ')');
                smtp_conn.reset();
                break;
            default:
                throw new Error("Unknown command: " + smtp_conn.command);
        }
    });

    return smtp_conn;
}
