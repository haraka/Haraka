'use strict';
// SMTP client object and class. This allows every part of the client
// protocol to be hooked for different levels of control, such as
// smtp_forward and smtp_proxy queue plugins.
// This newer version can use HostPool to get a connection to a pool of
// possible hosts in the configuration value "forwarding_host_pool", rather
// than a bunch of connections to a single host from the configuration values
// in "host" and "port" (see host_pool.js).

// node.js builtins
var events       = require('events');
var util         = require('util');

// npm deps
var generic_pool = require('generic-pool');
var ipaddr       = require('ipaddr.js');

// haraka libs
var line_socket = require('./line_socket');
var logger      = require('./logger');
var utils       = require('./utils');
var config      = require('./config');
var tls_socket  = require('./tls_socket');
var HostPool    = require('./host_pool');

var smtp_regexp = /^([0-9]{3})([ -])(.*)/;
var STATE = {
    IDLE: 1,
    ACTIVE: 2,
    RELEASED: 3,
    DESTROYED: 4,
};

function SMTPClient (port, host, connect_timeout, idle_timeout) {
    events.EventEmitter.call(this);
    this.uuid = utils.uuid();
    this.connect_timeout = parseInt(connect_timeout) || 30;
    this.socket = line_socket.connect(port, host);
    this.socket.setTimeout(this.connect_timeout * 1000);
    this.socket.setKeepAlive(true);
    this.state = STATE.IDLE;
    this.command = 'greeting';
    this.response = [];
    this.connected = false;
    this.authenticated = false;
    this.auth_capabilities = [];
    this.host = host;
    this.port = port;
    var client = this;

    this.socket.on('line', function (line) {
        client.emit('server_protocol', line);
        var matches = smtp_regexp.exec(line);
        if (!matches) {
            client.emit('error', client.uuid + ': Unrecognized response from upstream server: ' + line);
            client.destroy();
            return;
        }

        var code = matches[1];
        var cont = matches[2];
        var msg = matches[3];

        client.response.push(msg);
        if (cont !== ' ') {
            return;
        }

        if (client.command === 'auth') {
            if (code.match(/^3/) && cont === 'VXNlcm5hbWU6') {
                client.emit('auth_username');
                return;
            }
            else if (code.match(/^3/) && cont === 'UGFzc3dvcmQ6') {
                client.emit('auth_password');
                return;
            }
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
                this.upgrade(this.tls_options);
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
        if (client.socket.remoteAddress) {
            // "Value may be undefined if the socket is destroyed"
            client.remote_ip = ipaddr.process(client.socket.remoteAddress).toString();
        }
        else {
            logger.logerror('client.socket.remoteAddress undefined!');
        }
    });

    var closed = function (msg) {
        return function (error) {
            if (!error) {
                error = '';
            }
            // msg is e.g. "errored" or "timed out"
            // error is e.g. "Error: connect ECONNREFUSE"
            var errMsg = client.uuid +
                ': [' + client.host + ':' + client.port + '] ' +
                'SMTP connection ' + msg + ' ' + error;
            switch (client.state) {
                case STATE.ACTIVE:
                case STATE.IDLE:
                case STATE.RELEASED:
                    client.destroy();
                    break;
                default:
            }
            if (client.state === STATE.ACTIVE) {
                client.emit('error', errMsg);
                return;
            }
            if ((msg === 'errored' || msg === 'timed out')
                  && client.state === STATE.DESTROYED){
                client.emit('connection-error', errMsg);
            } // don't return, continue (original behavior)

            logger.logdebug('[smtp_client_pool] ' + errMsg + ' (state=' + client.state + ')');
        };
    };

    this.socket.on('error',   closed('errored'));
    this.socket.on('timeout', closed('timed out'));
    this.socket.on('close',   closed('closed'));
    this.socket.on('end',     closed('ended'));
}

util.inherits(SMTPClient, events.EventEmitter);

SMTPClient.prototype.load_tls_config = function (plugin) {
    var key = config.get('tls_key.pem', 'binary');
    var cert = config.get('tls_cert.pem', 'binary');
    var tls_options = (key && cert) ? { key: key, cert: cert } : {};
    this.tls_config = tls_socket.load_tls_ini();
    var config_options = ['ciphers','requestCert','rejectUnauthorized'];

    for (var i = 0; i < config_options.length; i++) {
        var opt = config_options[i];
        if (this.tls_config.main[opt] === undefined) { continue; }
        tls_options[opt] = this.tls_config.main[opt];
    }

    if (this.tls_config[plugin.name]) {
        for (var i = 0; i < config_options.length; i++) {
            var opt = config_options[i];
            if (this.tls_config[plugin.name][opt] === undefined) { continue; }
            tls_options[opt] = this.tls_config[plugin.name][opt];
        }
    }

    this.tls_options = tls_options;
}

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
    if (connection.transaction) { return false; }

    // This likely means the sender went away on us, cleanup.
    connection.logwarn(plugin, "transaction went away, releasing smtp_client");
    this.release();
    return true;
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
                logger.logdebug('[smtp_client_pool] uuid=' + smtp_client.uuid + ' host=' +
                    host + ' port=' + port + ' pool_timeout=' + pool_timeout + ' created');
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

// Get a smtp_client for the given attributes and set up the common
// config and listeners for plugins. This is what smtp_proxy and
// smtp_forward have in common.
exports.get_client_plugin = function (plugin, connection, c, callback) {
    // c = config
    // Merge in authentication settings from smtp_forward/proxy.ini if present
    // FIXME: config.auth could be changed when API isn't frozen
    if (c.auth_type || c.auth_user || c.auth_pass) {
        c.auth = {
            type: c.auth_type,
            user: c.auth_user,
            pass: c.auth_pass
        }
    }

    var hostport = get_hostport(connection, connection.server.notes, c);

    var pool = exports.get_pool(connection.server, hostport.port, hostport.host,
                                c.connect_timeout, c.timeout, c.max_connections);

    pool.acquire(function (err, smtp_client) {
        connection.logdebug(plugin, 'Got smtp_client: ' + smtp_client.uuid);

        var secured = false;

        smtp_client.load_tls_config(plugin);

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
                smtp_client.send_command(command, connection.hello.host);
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
                    if (!smtp_client.xclient) {
                        smtp_client.send_command('XCLIENT', 'ADDR=' + connection.remote.ip);
                        return;
                    }
                }

                if (smtp_client.response[line].match(/^STARTTLS/) && !secured) {
                    if (!tls_socket.is_no_tls_host(smtp_client.tls_config, c.host) &&
                        !tls_socket.is_no_tls_host(smtp_client.tls_config, smtp_client.remote_ip) &&
                        c.enable_tls)
                    {
                        smtp_client.socket.on('secure', on_secured);
                        smtp_client.send_command('STARTTLS');
                        return;
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
            if (!c.auth || smtp_client.authenticated) {
                if (smtp_client.is_dead_sender(plugin, connection)) {
                    return;
                }
                smtp_client.send_command('MAIL', 'FROM:' + connection.transaction.mail_from);
                return;
            }

            if (c.auth.type === null || typeof(c.auth.type) === 'undefined') { return; } // Ignore blank
            var auth_type = c.auth.type.toLowerCase();
            if (smtp_client.auth_capabilities.indexOf(auth_type) === -1) {
                throw new Error("Auth type \"" + auth_type + "\" not supported by server (supports: " + smtp_client.auth_capabilities.join(',') + ")");
            }
            switch (auth_type) {
                case 'plain':
                    if (!c.auth.user || !c.auth.pass) {
                        throw new Error("Must include auth.user and auth.pass for PLAIN auth.");
                    }
                    logger.logdebug('[smtp_client_pool] uuid=' + smtp_client.uuid + ' authenticating as "' + c.auth.user + '"');
                    smtp_client.send_command('AUTH',
                        'PLAIN ' + utils.base64(c.auth.user + "\0" + c.auth.user + "\0" + c.auth.pass) );
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
            smtp_client.send_command('MAIL', 'FROM:' + connection.transaction.mail_from);
        });

        // these errors only get thrown when the connection is still active
        smtp_client.on('error', function (msg) {
            connection.logwarn(plugin, msg);
            smtp_client.call_next();
        });

        // these are the errors thrown when the connection is dead
        smtp_client.on('connection-error', function (error){
            // error contains e.g. "Error: connect ECONNREFUSE"
            logger.logerror("backend failure: " + smtp_client.host + ':' + smtp_client.port + ' - ' + error);
            var host_pool = connection.server.notes.host_pool;
            // only exists for if forwarding_host_pool is set in the config
            if (host_pool){
                host_pool.failed(smtp_client.host, smtp_client.port);
            }
            smtp_client.call_next();
        });

        if (smtp_client.connected) {
            if (smtp_client.xclient) {
                smtp_client.send_command('XCLIENT', 'ADDR=' + connection.remote.ip);
            }
            else {
                smtp_client.emit('helo');
            }
        }

        callback(err, smtp_client);
    });
};

function get_hostport (connection, server_notes, config_arg) {

    var c = config_arg;
    if (c.forwarding_host_pool){
        if (! server_notes.host_pool){
            connection.logwarn("creating a new host_pool from " + c.forwarding_host_pool);
            server_notes.host_pool =
                new HostPool(
                    c.forwarding_host_pool, // "1.2.3.4:420,  5.6.7.8:420
                    c.dead_forwarding_host_retry_secs
                );
        }
        var host_pool = server_notes.host_pool;

        var host = host_pool.get_host();
        if (! host){
            logger.logerror('[smtp_client_pool] no backend hosts in pool!');
            throw new Error("no backend hosts found in pool!");
        }

        return host; // { host: 1.2.3.4, port: 567 }
    }
    else if (c.host && c.port){
        return { host: c.host, port: c.port };
    }
    else {
        // current behavior in get_pool is to default to localhost:25
        logger.logwarn("[smtp_client_pool] forwarding_host_pool or host and port " +
                "were not found in config file");
        throw new Error("You must specify either forwarding_host_pool or host and port");
    }
}
