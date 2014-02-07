// SMTP client object and class. This allows for every part of the client
// protocol to be hooked for different levels of control, such as
// smtp_forward and smtp_proxy queue plugins.

var events = require('events');
var util = require('util');
var generic_pool = require('generic-pool');
var line_socket = require('./line_socket');
var logger = require('./logger');
var uuid = require('./utils').uuid;
var base64 = require('./plugins/auth/auth_base').base64;

var smtp_regexp = /^([0-9]{3})([ -])(.*)/;
var STATE_IDLE = 1;
var STATE_ACTIVE = 2;
var STATE_RELEASED = 3;
var STATE_DEAD = 4;
var STATE_DESTROYED = 5;

var tls_key;
var tls_cert;

function SMTPClient(port, host, connect_timeout, idle_timeout) {
    events.EventEmitter.call(this);
    this.uuid = uuid();
    this.socket = line_socket.connect(port, host);
    this.socket.setTimeout(((connect_timeout === undefined) ? 30 : connect_timeout) * 1000);
    this.socket.setKeepAlive(true);
    this.state = STATE_IDLE;
    this.command = 'greeting';
    this.response = []
    this.connected = false;
    this.authenticated = false;
    this.auth_capabilities = [];
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
            self.emit('bad_code', code, self.response.join(' '));
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
                if (tls_key && tls_cert) {
                    this.upgrade({key: tls_key, cert: tls_cert});
                }
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
            case 'auth':
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

    this.socket.on('connect', function () {
        // Remove connection timeout and set idle timeout
        self.socket.setTimeout(((idle_timeout) ? idle_timeout : 300) * 1000);
    });

    var closed = function (msg) {
        return function (error) {
            if (!error) {
                error = '';
            }
            if (self.state === STATE_ACTIVE) {
                self.emit('error', self.uuid + ': SMTP connection ' + msg + ' ' + error);
                self.destroy();
            }
            else {
                logger.logdebug('[smtp_client_pool] ' + self.uuid + ': SMTP connection ' + msg + ' ' + error + ' (state=' + self.state + ')');
                if (self.state === STATE_IDLE) {
                    self.state = STATE_DEAD;
                    self.destroy();
                }
                else if (self.state === STATE_RELEASED) {
                    self.destroy();
                }
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
    if (this.state === STATE_DESTROYED) {
        return;
    }
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
        if (this.state === STATE_DESTROYED) {
            return;
        }
        this.state = STATE_IDLE;
        this.removeAllListeners('rset');
        this.removeAllListeners('bad_code');
        this.pool.release(this);
    });

    this.send_command('RSET');
};

SMTPClient.prototype.destroy = function () {
    if (this.state !== STATE_DESTROYED) {
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
    var port = port || 25;
    var host = host || 'localhost';
    var connect_timeout = (connect_timeout === undefined) ? 30 : connect_timeout;
    var pool_timeout = (pool_timeout === undefined) ? 300 : pool_timeout;
    var name = port + ':' + host + ':' + pool_timeout;
    if (!server.notes.pool) {
        server.notes.pool = {};
    }
    if (!server.notes.pool[name]) {
        var pool = generic_pool.Pool({
            name: name,
            create: function (callback) {
                var smtp_client = new SMTPClient(port, host, connect_timeout);
                logger.logdebug('[smtp_client_pool] uuid=' + smtp_client.uuid + ' host=' + host 
                    + ' port=' + port + ' pool_timeout=' + pool_timeout + ' created');
                callback(null, smtp_client);
            },
            destroy: function(smtp_client) {
                logger.logdebug('[smtp_client_pool] ' + smtp_client.uuid + ' destroyed, state=' + smtp_client.state);
                smtp_client.state = STATE_DESTROYED;
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
                if (smtp_client.state === STATE_DEAD) {
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
exports.get_client = function (server, callback, port, host, connect_timeout, pool_timeout, max) {
    var pool = exports.get_pool(server, port, host, connect_timeout, pool_timeout, max);
    pool.acquire(callback);
};

// Get a smtp_client for the given attributes and set it up the common
// config and listeners for plugins. Currently this is what smtp_proxy and
// smtp_forward have in common.
exports.get_client_plugin = function (plugin, connection, config, callback) {
    var enable_tls = /(true|yes|1)/i.exec(config.main.enable_tls) != null;
    var pool = exports.get_pool(connection.server, config.main.port,
        config.main.host, config.main.connect_timeout, config.main.timeout, config.main.max_connections);
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
            for (var line in smtp_client.response) {
                if (smtp_client.response[line].match(/^XCLIENT/)) {
                    if(!smtp_client.xclient) {
                        smtp_client.send_command('XCLIENT',
                            'ADDR=' + connection.remote_ip);
                        return;
                    }
                }
                if (smtp_client.response[line].match(/^STARTTLS/) && !secured) {
                    tls_key = plugin.config.get('tls_key.pem', 'binary');
                    tls_cert = plugin.config.get('tls_cert.pem', 'binary');
                    if (tls_key && tls_cert && enable_tls) {
                        smtp_client.socket.on('secure', function () {
                            secured = true;
                            smtp_client.emit('greeting', 'EHLO');
                        });
                        smtp_client.send_command('STARTTLS');
                        return;
                    }
                }
                
                var auth_matches;
                if (auth_matches = smtp_client.response[line].match(/^AUTH (.*)$/)) {
                    smtp_client.auth_capabilities = [];
                    auth_matches = auth_matches[1].split(' ');
                    for (var i = 0; i < auth_matches.length; i++) {
                        smtp_client.auth_capabilities.push(auth_matches[i].toLowerCase());
                    }
                }
            }
        });
        
        smtp_client.on('helo', function () {
            if (config.auth && !smtp_client.authenticated) {
                if (config.auth.type === null || typeof(config.auth.type) === 'undefined') { return; } // Ignore blank
                var auth_type = config.auth.type.toLowerCase();
                if (smtp_client.auth_capabilities.indexOf(auth_type) == -1) {
                    throw new Error("Auth type \"" + auth_type + "\" not supported by server (supports: " + smtp_client.auth_capabilities.join(',') + ")")
                }
                switch (auth_type) {
                    case 'plain':
                        if (!config.auth.user || !config.auth.pass) {
                            throw new Error("Must include auth.user and auth.pass for PLAIN auth.");
                        }
                        logger.logdebug('[smtp_client_pool] uuid=' + smtp_client.uuid + ' authenticating as "' + config.auth.user + '"');
                        smtp_client.send_command('AUTH',
                            'PLAIN ' + base64(config.auth.user + "\0" + config.auth.user + "\0" + config.auth.pass) );
                        break;
                    case 'cram-md5':
                        throw new Error("Not implemented");
                    default:
                        throw new Error("Unknown AUTH type: " + auth_type);
                }
            }
            else {
                if (smtp_client.is_dead_sender(plugin, connection)) {
                  return;
                }
                smtp_client.send_command('MAIL',
                    'FROM:' + connection.transaction.mail_from);
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
