var events = require('events');
var util = require('util');
var line_socket = require('../../line_socket');
var config = require('../../config');
var logger = require('../../logger');
var generic_pool = require('generic-pool');
var smtp_regexp = /^([0-9]{3})([ -])(.*)/;

function SMTPClient(port, host, timeout, enable_tls) {
    events.EventEmitter.call(this);
    this.socket = line_socket.connect(port, host);
    this.socket.setTimeout(timeout * 1000);
    this.released = true;
    this.set_idle_listeners();
    this.command = 'greeting';
    this.response = []
    this.connected = false;
    this.data = [];
    this.data_marker = 0;
    this.dot_pending = true;
    var self = this;

    this.socket.on('drain', function () {
        if (self.dot_pending && self.command === 'mailbody') {
            process.nextTick(function () { self.send_data() });
        }
    });

    this.socket.on('line', function (line) {
        this.emit('server_protocol', line);
        var matches = smtp_regexp.exec(line);
        if (!matches) {
            self.emit('error', 'Unrecognised response from upstream server: ' + line);
            self.pool.destroy(this);
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
            // Parse CAPABILITIES
            for (var i in self.response) {
                if (self.response[i].match(/^XCLIENT/)) {
                    if(!self.xclient) {
                        self.send_xclient();
                        return;
                    }
                }
                if (self.response[i].match(/^STARTTLS/)) {
                    var key = config.get('tls_key.pem', 'data').join("\n");
                    var cert = config.get('tls_cert.pem', 'data').join("\n");
                    if (key && cert && enable_tls) {
                        this.on('secure', function () {
                            self.emit('greeting', 'EHLO');
                        });
                        self.send_command('STARTTLS');
                        return;
                    }
                }
            }
        }
        if (self.command === 'xclient' && code.match(/^5/)) {
            // XCLIENT command was rejected (no permission?)
            // Carry on without XCLIENT
            self.command = 'helo';
        }
        else if (code.match(/^[45]/)) {
            self.emit('bad_code', code, msg);
            if (self.released) {
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
            case 'rset':
                self.emit(self.command);
                break;
            case 'dot':
                self.emit('dot');
                self.data = [];
                self.data_marker = 0;
                self.dot_pending = true;
                break;
            case 'quit':
                self.pool.destroy(self);
                break;
            default:
                throw new Error("Unknown command: " + self.command);
        }
    });
}

util.inherits(SMTPClient, events.EventEmitter);

SMTPClient.prototype.start = function () {
    var self = this;

    this.socket.on('error', function (err) {
        self.emit('error', 'SMTP connection failed: ' + err);
        self.pool.destroy(self);
    });

    this.socket.on('timeout', function () {
        self.emit('error', 'SMTP connection timed out');
        self.pool.destroy(self);
    });

    this.socket.on('close', function (had_error) {
        self.pool.destroy(self);
    });

    if (this.connected) {
        if (this.xclient) {
            this.send_xclient();
        }
        else {
            this.emit('helo');
        }
    }
};

SMTPClient.prototype.send_command = function (command, data) {
    var line = (command == 'dot') ? '.' : command + (data ? (' ' + data) : '');
    this.emit('client_protocol', line);
    this.command = command.toLowerCase();
    this.response = [];
    this.socket.write(line + "\r\n");
};

SMTPClient.prototype.send_data = function () {
    while (this.data_marker < this.data.length) {
        var line = this.data[this.data_marker];
        this.data_marker++;
        line = line.replace(/^\./, '..').replace(/\r?\n/g, '\r\n');
        if (!this.socket.write(line)) {
            return;
        }
    }
    if (this.dot_pending) {
        this.dot_pending = false;
        this.send_command('dot');
    }
};

SMTPClient.prototype.release = function () {
    this.released = true;
    this.removeAllListeners();

    this.on('bad_code', function (code, msg) {
        this.pool.destroy(this);
    });

    this.on('rset', function () {
        this.removeAllListeners();
        this.set_idle_listeners();
        this.pool.release(this);
    });

    this.send_command('RSET');
};

SMTPClient.prototype.set_idle_listeners = function () {
    this.socket.removeAllListeners('error');
    this.socket.removeAllListeners('timeout');
    this.socket.removeAllListeners('close');
    var self = this;

    this.socket.on('error', function (err) {
        self.dead = true;
    });

    this.socket.on('timeout', function () {
        self.dead = true;
    });

    this.socket.on('close', function (had_error) {
        self.dead = true;
    });
};

exports.get_pool = function (server, config) {
    var port = config.main.port || 25;
    var host = config.main.host || 'localhost';
    var timeout = (config.main.timeout == undefined) ? 300 : config.main.timeout;
    var enable_tls = /(true|yes|1)/i.exec(config.main.enable_tls) != null;
    var name = port + ':' + host + ':' + timeout + ':' + enable_tls;
    if (!server.notes.pool) {
        server.notes.pool = {};
    }
    if (!server.notes.pool[name]) {
        var pool = generic_pool.Pool({
            name: name,
            create: function (callback) {
                var smtp_client = new SMTPClient(port, host, timeout, enable_tls);
                callback(null, smtp_client);
            },
            destroy: function(smtp_client) {
                if (!smtp_client.dead) {
                    smtp_client.socket.destroy();
                }
            },
            max: config.main.max_connections || 1000,
            idleTimeoutMillis: timeout * 1000,
            log: function (str, level) {
                level = (level == 'verbose') ? 'debug' : level;
                logger['log' + level]('[smtp_client_pool] ' + str);
            }
        });

        var acquire = pool.acquire;
        pool.acquire = function (callback, priority) {
            var callback_wrapper = function (err, smtp_client) {
                if (smtp_client.dead) {
                    pool.acquire(callback, priority);
                    return;
                }
                smtp_client.pool = pool;
                smtp_client.released = false;
                callback(err, smtp_client);
            };
            acquire.call(pool, callback_wrapper, priority);
        };
        server.notes.pool[name] = pool;
    }
    return server.notes.pool[name];
};

exports.get_client = function (server, config, callback) {
    exports.get_pool(server, config).acquire(callback);
};
