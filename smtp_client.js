'use strict';
// SMTP client object and class. This allows for every part of the client
// protocol to be hooked for different levels of control, such as
// smtp_forward and smtp_proxy queue plugins.

var events = require('events');
var util = require('util');
var generic_pool = require('generic-pool');
var line_socket = require('./line_socket');
var logger = require('./logger');
var uuid = require('./utils').uuid;
var utils = require('./utils');

var smtp_regexp = /^([0-9]{3})([ -])(.*)/;
var STATE = {
    IDLE: 1,
    ACTIVE: 2,
    RELEASED: 3,
    DESTROYED: 4,
};

var tls_key;
var tls_cert;

function SMTPClient(port, host, connect_timeout, idle_timeout) {
    events.EventEmitter.call(this);
    this.uuid = uuid();
    this.socket = line_socket.connect(port, host);
    this.socket.setTimeout(((connect_timeout === undefined) ? 30 : connect_timeout) * 1000);
    this.socket.setKeepAlive(true);
    this.state = STATE.IDLE;
    this.command = 'greeting';
    this.response = [];
    this.connected = false;
    this.authenticated = false;
    this.auth_capabilities = [];
    var client = this;

    this.socket.on('line', function (line) {
        client.emit('server_protocol', line);
        var matches = smtp_regexp.exec(line);
        if (!matches) {
            client.emit('error', client.uuid + ': Unrecognised response from upstream server: ' + line);
            client.destroy();
            return;
        }

        var code = matches[1],
            cont = matches[2],
            msg = matches[3];
        client.response.push(msg);
        if (cont !== ' ') {
            return;
        }

        if (client.command === 'ehlo') {
            if (code.match(/^5/)) {
                // Handle fallback to HELO if EHLO is rejected
                client.emit('greeting', 'HELO');
                return;
            }
            client.emit('capabilities');
            if (client.command !== 'ehlo') {
                return;
            }
        }
        if (client.command === 'xclient' && code.match(/^5/)) {
            // XCLIENT command was rejected (no permission?)
            // Carry on without XCLIENT
            client.command = 'helo';
        }
        else if (code.match(/^[45]/)) {
            client.emit('bad_code', code, client.response.join(' '));
            if (client.state !== STATE.ACTIVE) {
                return;
            }
        }
        switch (client.command) {
            case 'xclient':
                client.xclient = true;
                client.emit('xclient', 'EHLO');
                break;
            case 'starttls':
                if (tls_key && tls_cert) {
                    this.upgrade({key: tls_key, cert: tls_cert});
                }
                break;
            case 'greeting':
                client.connected = true;
                client.emit('greeting', 'EHLO');
                break;
            case 'ehlo':
                client.emit('helo');
                break;
            case 'helo':
            case 'mail':
            case 'rcpt':
            case 'data':
            case 'dot':
            case 'rset':
            case 'auth':
                client.emit(client.command);
                break;
            case 'quit':
                client.emit('quit');
                client.destroy();
                break;
            default:
                throw new Error("Unknown command: " + client.command);
        }
    });

    this.socket.on('connect', function () {
        // Remove connection timeout and set idle timeout
        client.socket.setTimeout(((idle_timeout) ? idle_timeout : 300) * 1000);
    });

    var closed = function (msg) {
        return function (error) {
            if (!error) {
                error = '';
            }
            if (client.state === STATE.ACTIVE) {
                client.emit('error', client.uuid + ': SMTP connection ' + msg + ' ' + error);
                client.destroy();
            }
            else {
                logger.logdebug('[smtp_client_pool] ' + client.uuid + ': SMTP connection ' + msg + ' ' + error + ' (state=' + client.state + ')');
                if (client.state === STATE.IDLE) {
                    client.destroy();
                }
                else if (client.state === STATE.RELEASED) {
                    client.destroy();
                }
            }
        };
    };

    this.socket.on('error',   closed('errored'));
    this.socket.on('timeout', closed('timed out'));
    this.socket.on('close',   closed('closed'));
    this.socket.on('end',     closed('ended'));
}

util.inherits(SMTPClient, events.EventEmitter);

SMTPClient.prototype.send_command = function (command, data) {
    var line = (command === 'dot') ? '.' : command + (data ? (' ' + data) : '');
    this.emit('client_protocol', line);
    this.command = command.toLowerCase();
    this.response = [];
    this.socket.write(line + "\r\n");
};

SMTPClient.prototype.start_data = function (data) {
    this.response = [];
    this.command = 'dot';
    data.pipe(this.socket, { dot_stuffing: true, ending_dot: true, end: false });
};

SMTPClient.prototype.release = function () {
    if (!this.connected || this.command === 'data' || this.command === 'mailbody') {
        // Destroy here, we can't reuse a connection that was mid-data.
        this.destroy();
        return;
    }

    logger.logdebug('[smtp_client_pool] ' + this.uuid + ' resetting, state=' + this.state);
    if (this.state === STATE.DESTROYED) {
        return;
    }
    this.state = STATE.RELEASED;
    this.removeAllListeners('greeting');
    this.removeAllListeners('capabilities');
    this.removeAllListeners('xclient');
    this.removeAllListeners('helo');
    this.removeAllListeners('mail');
    this.removeAllListeners('rcpt');
    this.removeAllListeners('data');
    this.removeAllListeners('dot');
    this.removeAllListeners('rset');
    this.removeAllListeners('auth');
    this.removeAllListeners('client_protocol');
    this.removeAllListeners('server_protocol');
    this.removeAllListeners('error');
    this.removeAllListeners('bad_code');

    this.on('bad_code', function (code, msg) {
        this.destroy();
    });

    this.on('rset', function () {
        logger.logdebug('[smtp_client_pool] ' + this.uuid + ' releasing, state=' + this.state);
        if (this.state === STATE.DESTROYED) {
            return;
        }
        this.state = STATE.IDLE;
        this.removeAllListeners('rset');
        this.removeAllListeners('bad_code');
        this.pool.release(this);
    });

    this.send_command('RSET');
};

SMTPClient.prototype.destroy = function () {
    if (this.state !== STATE.DESTROYED) {
        this.pool.destroy(this);
    }
};

SMTPClient.prototype.is_dead_sender = function (plugin, connection) {
    if (!connection.transaction) {
        // This likely means the sender went away on us, cleanup.
        connection.logwarn(
          plugin, "transaction went away, releasing smtp_client"
        );
        this.release();
        return true;
    }

    return false;
};

// Separate pools are kept for each set of server attributes.
exports.get_pool = function (server, port, host, connect_timeout, pool_timeout, max) {
    port = port || 25;
    host = host || 'localhost';
    connect_timeout = (connect_timeout === undefined) ? 30 : connect_timeout;
    pool_timeout = (pool_timeout === undefined) ? 300 : pool_timeout;
    var name = port + ':' + host + ':' + pool_timeout;
    if (!server.notes.pool) {
        server.notes.pool = {};
    }
    if (!server.notes.pool[name]) {
        var pool = generic_pool.Pool({
            name: name,
            create: function (callback) {
                var smtp_client = new SMTPClient(port, host, connect_timeout);
                logger.logdebug('[smtp_client_pool] uuid=' + smtp_client.uuid + ' host=' + host +
                    ' port=' + port + ' pool_timeout=' + pool_timeout + ' created');
                callback(null, smtp_client);
            },
            destroy: function(smtp_client) {
                logger.logdebug('[smtp_client_pool] ' + smtp_client.uuid + ' destroyed, state=' + smtp_client.state);
                smtp_client.state = STATE.DESTROYED;
                smtp_client.socket.destroy();
                // Remove pool object from server notes once empty
                var size = pool.getPoolSize();
                if (size === 0) {
                    delete server.notes.pool[name];
                }
            },
            max: max || 1000,
            idleTimeoutMillis: pool_timeout * 1000,
            log: function (str, level) {
                level = (level === 'verbose') ? 'debug' : level;
                logger['log' + level]('[smtp_client_pool] [' + name + '] ' + str);
            }
        });

        var acquire = pool.acquire;
        pool.acquire = function (callback, priority) {
            var callback_wrapper = function (err, smtp_client) {
                smtp_client.pool = pool;
                smtp_client.state = STATE.ACTIVE;
                callback(err, smtp_client);
            };
            acquire.call(pool, callback_wrapper, priority);
        };
        server.notes.pool[name] = pool;
    }
    return server.notes.pool[name];
};

// Get a smtp_client for the given attributes.
exports.get_client = function (server, callback, port, host, connect_timeout, pool_timeout, max) {
    var pool = exports.get_pool(server, port, host, connect_timeout, pool_timeout, max);
    pool.acquire(callback);
};

// Get a smtp_client for the given attributes and set it up the common
// config and listeners for plugins. Currently this is what smtp_proxy and
// smtp_forward have in common.
exports.get_client_plugin = function (plugin, connection, config, callback) {
    var c = config.main;
    var pool = exports.get_pool(connection.server, c.port, c.host,
                                c.connect_timeout, c.timeout, c.max_connections);
    pool.acquire(function (err, smtp_client) {
        connection.logdebug(plugin, 'Got smtp_client: ' + smtp_client.uuid);

        var secured = false;

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
            var on_secured = function () {
                secured = true;
                smtp_client.emit('greeting', 'EHLO');
            };
            for (var line in smtp_client.response) {
                if (smtp_client.response[line].match(/^XCLIENT/)) {
                    if(!smtp_client.xclient) {
                        smtp_client.send_command('XCLIENT',
                            'ADDR=' + connection.remote_ip);
                        return;
                    }
                }
                if (smtp_client.response[line].match(/^STARTTLS/) && !secured) {
                    if (c.enable_tls) {
                        tls_key = plugin.config.get('tls_key.pem', 'binary');
                        tls_cert = plugin.config.get('tls_cert.pem', 'binary');
                        if (tls_key && tls_cert) {
                            smtp_client.socket.on('secure', on_secured);
                            smtp_client.send_command('STARTTLS');
                            return;
                        }
                    }
                }

                var auth_matches = smtp_client.response[line].match(/^AUTH (.*)$/);
                if (auth_matches) {
                    smtp_client.auth_capabilities = [];
                    auth_matches = auth_matches[1].split(' ');
                    for (var i = 0; i < auth_matches.length; i++) {
                        smtp_client.auth_capabilities.push(auth_matches[i].toLowerCase());
                    }
                }
            }
        });

        smtp_client.on('helo', function () {
            if (!config.auth || smtp_client.authenticated) {
                if (smtp_client.is_dead_sender(plugin, connection)) {
                    return;
                }
                smtp_client.send_command('MAIL', 'FROM:' + connection.transaction.mail_from);
                return;
            }

            if (config.auth.type === null || typeof(config.auth.type) === 'undefined') { return; } // Ignore blank
            var auth_type = config.auth.type.toLowerCase();
            if (smtp_client.auth_capabilities.indexOf(auth_type) === -1) {
                throw new Error("Auth type \"" + auth_type + "\" not supported by server (supports: " + smtp_client.auth_capabilities.join(',') + ")");
            }
            switch (auth_type) {
                case 'plain':
                    if (!config.auth.user || !config.auth.pass) {
                        throw new Error("Must include auth.user and auth.pass for PLAIN auth.");
                    }
                    logger.logdebug('[smtp_client_pool] uuid=' + smtp_client.uuid + ' authenticating as "' + config.auth.user + '"');
                    smtp_client.send_command('AUTH',
                        'PLAIN ' + utils.base64(config.auth.user + "\0" + config.auth.user + "\0" + config.auth.pass) );
                    break;
                case 'cram-md5':
                    throw new Error("Not implemented");
                default:
                    throw new Error("Unknown AUTH type: " + auth_type);
            }
        });

        smtp_client.on('auth', function () {
            if (smtp_client.is_dead_sender(plugin, connection)) {
              return;
            }
            smtp_client.authenticated = true;
            smtp_client.send_command('MAIL',
                'FROM:' + connection.transaction.mail_from);
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
