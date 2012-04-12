// SMTP client object and class. This allows for every part of the client
// protocol to be hooked for different levels of control, such as
// smtp_forward and smtp_proxy queue plugins.

var events = require('events');
var util = require('util');
var generic_pool = require('generic-pool');
var line_socket = require('./line_socket');
var logger = require('./logger');
var constants = require('./constants');
var uuid = require('./utils').uuid;

var smtp_regexp = /^([0-9]{3})([ -])(.*)/;
var STATE_IDLE = 1;
var STATE_ACTIVE = 2;
var STATE_RELEASED = 3;
var STATE_DEAD = 4;
var STATE_DESTROYED = 4;

function SMTPClient(port, host, timeout, enable_tls) {
    events.EventEmitter.call(this);
    this.uuid = uuid();
    this.socket = line_socket.connect(port, host);
    this.socket.setTimeout(timeout * 1000);
    this.state = STATE_IDLE;
    this.command = 'greeting';
    this.response = []
    this.connected = false;
    var self = this;

    this.socket.on('line', function (line) {
        self.emit('server_protocol', line);
        var matches = smtp_regexp.exec(line);
        if (!matches) {
            self.emit('error', self.uuid + ': Unrecognised response from upstream server: ' + line);
            self.destroy();
            return;
        }

        var code = matches[1],
            cont = matches[2],
            msg = matches[3];
        self.response.push(msg);
        if (cont !== ' ') {
            return;
        }

        if (self.command === 'ehlo') {
            if (code.match(/^5/)) {
                // Handle fallback to HELO if EHLO is rejected
                self.emit('greeting', 'HELO');
                return;
            }
            self.emit('capabilities');
            if (self.command != 'ehlo') {
                return;
            }
        }
        if (self.command === 'xclient' && code.match(/^5/)) {
            // XCLIENT command was rejected (no permission?)
            // Carry on without XCLIENT
            self.command = 'helo';
        }
        else if (code.match(/^[45]/)) {
            self.emit('bad_code', code, msg);
            if (self.state != STATE_ACTIVE) {
                return;
            }
        }
        switch (self.command) {
            case 'xclient':
                self.xclient = true;
                self.emit('xclient', 'EHLO');
                break;
            case 'starttls':
                this.upgrade({key: key, cert: cert});
                break;
            case 'greeting':
                self.connected = true;
                self.emit('greeting', 'EHLO');
                break;
            case 'ehlo':
                self.emit('helo');
                break;
            case 'helo':
            case 'mail':
            case 'rcpt':
            case 'data':
            case 'dot':
            case 'rset':
                self.emit(self.command);
                break;
            case 'quit':
                self.emit('quit');
                self.destroy();
                break;
            default:
                throw new Error("Unknown command: " + self.command);
        }
    });

    this.socket.on('drain', function () {
        if (self.command === 'mailbody') {
            process.nextTick(function () { self.continue_data() });
        }
    });

    var closed = function (msg) {
        return function (error) {
            if (self.state == STATE_IDLE) {
                self.state = STATE_DEAD;
            }
            else if (self.state != STATE_DEAD && self.state != STATE_DESTROYED) {
                if (!error) {
                    error = '';
                }
                self.emit('error', self.uuid + ': SMTP connection ' + msg + ' ' + error);
                self.destroy();
            }
        };
    };

    this.socket.on('error', closed('errored'));
    this.socket.on('timeout', closed('timed out'));
    this.socket.on('close', closed('closed'));
    this.socket.on('end', closed('ended'));
}

util.inherits(SMTPClient, events.EventEmitter);

SMTPClient.prototype.send_command = function (command, data) {
    var line = (command == 'dot') ? '.' : command + (data ? (' ' + data) : '');
    this.emit('client_protocol', line);
    this.command = command.toLowerCase();
    this.response = [];
    this.socket.write(line + "\r\n");
};

SMTPClient.prototype.start_data = function (data) {
    this.command = 'mailbody';
    if (data instanceof Function) {
        this.send_data = data;
    }
    else if (data instanceof Array) {
        var data_marker = 0;
        this.send_data = function () {
            while (data_marker < data.length) {
                var line = data[data_marker];
                data_marker++;
                if (!this.send_data_line(line)) {
                    return false;
                }
            }
            return true;
        };
    }
    else {
        this.send_data = function () {
            this.socket.write(data);
            return true;
        };
    }
    this.continue_data();
};

SMTPClient.prototype.continue_data = function () {
    if (!this.send_data()) {
        return;
    }
    this.send_command('dot');
};

SMTPClient.prototype.send_data_line = function (line) {
    line = line.replace(/^\./, '..').replace(/\r?\n/g, '\r\n');
    return this.socket.write(line);
};

SMTPClient.prototype.release = function () {
    if (!this.connected || this.command == 'data' || this.command == 'mailbody') {
        // Destroy here, we can't reuse a connection that was mid-data.
        this.destroy();
        return;
    }

    logger.logdebug('[smtp_client_pool] ' + this.uuid + ' resetting');
    this.state = STATE_RELEASED;
    this.removeAllListeners('greeting');
    this.removeAllListeners('capabilities');
    this.removeAllListeners('xclient');
    this.removeAllListeners('helo');
    this.removeAllListeners('mail');
    this.removeAllListeners('rcpt');
    this.removeAllListeners('data');
    this.removeAllListeners('dot');
    this.removeAllListeners('rset');
    this.removeAllListeners('client_protocol');
    this.removeAllListeners('server_protocol');
    this.removeAllListeners('error');
    this.removeAllListeners('bad_code');

    this.on('bad_code', function (code, msg) {
        this.destroy();
    });

    this.on('rset', function () {
        this.state = STATE_IDLE;
        this.removeAllListeners('rset');
        this.removeAllListeners('bad_code');
        logger.logdebug('[smtp_client_pool] ' + this.uuid + ' releasing');
        this.pool.release(this);
    });

    this.send_command('RSET');
};

SMTPClient.prototype.destroy = function () {
    if (this.state != STATE_DESTROYED) {
        this.pool.destroy(this);
    }
};

// Separate pools are kept for each set of server attributes.
exports.get_pool = function (server, port, host, timeout, enable_tls, max) {
    var port = port || 25;
    var host = host || 'localhost';
    var timeout = (timeout == undefined) ? 300 : timeout;
    var enable_tls = /(true|yes|1)/i.exec(enable_tls) != null;
    var name = port + ':' + host + ':' + timeout + ':' + enable_tls;
    if (!server.notes.pool) {
        server.notes.pool = {};
    }
    if (!server.notes.pool[name]) {
        var pool = generic_pool.Pool({
            name: name,
            create: function (callback) {
                var smtp_client = new SMTPClient(port, host, timeout, enable_tls);
                logger.logdebug('[smtp_client_pool] ' + smtp_client.uuid + ' created');
                callback(null, smtp_client);
            },
            destroy: function(smtp_client) {
                logger.logdebug('[smtp_client_pool] ' + smtp_client.uuid + ' destroyed, state=' + smtp_client.state);
                smtp_client.state = STATE_DESTROYED;
                smtp_client.socket.destroy();
            },
            max: max || 1000,
            idleTimeoutMillis: timeout * 1000,
            log: function (str, level) {
                level = (level == 'verbose') ? 'debug' : level;
                logger['log' + level]('[smtp_client_pool] ' + str);
            }
        });

        var acquire = pool.acquire;
        pool.acquire = function (callback, priority) {
            var callback_wrapper = function (err, smtp_client) {
                smtp_client.pool = pool;
                if (smtp_client.state == STATE_DEAD) {
                    smtp_client.destroy();
                    pool.acquire(callback, priority);
                    return;
                }
                smtp_client.state = STATE_ACTIVE;
                callback(err, smtp_client);
            };
            acquire.call(pool, callback_wrapper, priority);
        };
        server.notes.pool[name] = pool;
    }
    return server.notes.pool[name];
};

// Get a smtp_client for the given attributes.
exports.get_client = function (server, callback, port, host, timeout, enable_tls, max) {
    var pool = exports.get_pool(server, port, host, timeout, enable_tls, max);
    pool.acquire(callback);
};

// Get a smtp_client for the given attributes and set it up the common
// config and listeners for plugins. Currently this is what smtp_proxy and
// smtp_forward have in common.
exports.get_client_plugin = function (plugin, connection, config, callback) {
    var pool = exports.get_pool(connection.server, config.main.port,
        config.main.host, config.main.timeout, config.main.enable_tls,
        config.main.max_connections);
    pool.acquire(function (err, smtp_client) {
        connection.logdebug(plugin, 'Got smtp_client: ' + smtp_client.uuid);
        smtp_client.call_next = function (retval, msg) {
            if (this.next) {
                var next = this.next;
                delete this.next;
                next(retval, msg);
            }
        };

        smtp_client.on('client_protocol', function (line) {
            connection.logprotocol(plugin, 'C: ' + line);
        });

        smtp_client.on('server_protocol', function (line) {
            connection.logprotocol(plugin, 'S: ' + line);
        });

        var helo = function (command) {
            if (smtp_client.xclient) {
                smtp_client.send_command(command, connection.hello_host);
            }
            else {
                smtp_client.send_command(command, plugin.config.get('me'));
            }
        };
        smtp_client.on('greeting', helo);
        smtp_client.on('xclient', helo);

        smtp_client.on('capabilities', function () {
            for (var line in smtp_client.response) {
                if (smtp_client.response[line].match(/^XCLIENT/)) {
                    if(!smtp_client.xclient) {
                        smtp_client.send_command('XCLIENT',
                            'ADDR=' + connection.remote_ip);
                        return;
                    }
                }
                if (smtp_client.response[line].match(/^STARTTLS/)) {
                    var key = plugin.config.get('tls_key.pem', 'data').join("\n");
                    var cert = plugin.config.get('tls_cert.pem', 'data').join("\n");
                    if (key && cert && enable_tls) {
                        smtp_client.socket.on('secure', function () {
                            smtp_client.emit('greeting', 'EHLO');
                        });
                        smtp_client.send_command('STARTTLS');
                        return;
                    }
                }
            }
        });

        smtp_client.on('helo', function () {
            smtp_client.send_command('MAIL',
                'FROM:' + connection.transaction.mail_from);
        });

        smtp_client.on('dot', function () {
            smtp_client.call_next(constants.ok, smtp_client.response + ' (' + connection.transaction.uuid + ')');
            smtp_client.release();
        });

        smtp_client.on('error', function (msg) {
            connection.logwarn(plugin, msg);
            smtp_client.call_next();
        });

        if (smtp_client.connected) {
            if (smtp_client.xclient) {
                smtp_client.send_command('XCLIENT',
                    'ADDR=' + connection.remote_ip);
            }
            else {
                smtp_client.emit('helo');
            }
        }

        callback(err, smtp_client);
    });
};
