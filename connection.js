'use strict';
// a single connection

var path        = require('path');
var config      = require('./config');
var logger      = require('./logger');
var trans       = require('./transaction');
var dns         = require('dns');
var plugins     = require('./plugins');
var constants   = require('./constants');
var rfc1869     = require('./rfc1869');
var fs          = require('fs');
var Address     = require('./address').Address;
var uuid        = require('./utils').uuid;
var outbound    = require('./outbound');
var date_to_str = require('./utils').date_to_str;
var indexOfLF   = require('./utils').indexOfLF;
var ipaddr      = require('ipaddr.js');
var ResultStore = require('./result_store');

var version  = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'))).version;

var line_regexp = /^([^\n]*\n)/;

var connection = exports;

var states = exports.states = {
    STATE_CMD:             1,
    STATE_LOOP:            2,
    STATE_DATA:            3,
    STATE_PAUSE:           4,
    STATE_PAUSE_SMTP:      5,
    STATE_PAUSE_DATA:      6,
    STATE_DISCONNECTING:   99,
    STATE_DISCONNECTED:    100,
};

// copy logger methods into Connection:
for (var key in logger) {
    if (key.match(/^log\w/)) {
        Connection.prototype[key] = (function (key) {
            return function () {
                // pass the connection instance to logger
                var args = [ this ];
                for (var i=0, l=arguments.length; i<l; i++) {
                    args.push(arguments[i]);
                }
                logger[key].apply(logger, args);
            };
        })(key);
    }
}

// Load HAProxy hosts into an object for fast lookups
// as this list is checked on every new connection.
var haproxy_hosts = {};
function loadHAProxyHosts() {
    var hosts = config.get('haproxy_hosts', 'list', function () {
        loadHAProxyHosts();
    });
    var new_host_list = [];
    for (var i=0; i<hosts.length; i++) {
        var host = hosts[i].split(/\//);
        new_host_list[i] = [ipaddr.IPv4.parse(host[0]), parseInt(host[1] || 32)];
    }
    haproxy_hosts = new_host_list;
}
loadHAProxyHosts();

function setupClient(self) {
    var ip = self.client.remoteAddress;
    if (!ip) {
        self.logdebug('setupClient got no IP address for this connection!');
        self.client.destroy();
        return;
    }

    var local_addr = self.server.address();
    if (local_addr && local_addr.address) {
        self.local_ip = ipaddr.process(local_addr.address).toString();
        self.local_port = local_addr.port;
    }
    self.remote_ip = ipaddr.process(ip).toString();
    self.remote_port = self.client.remotePort;
    self.lognotice('connect ip=' + self.remote_ip + ' port=' + self.remote_port +
                   ' local_ip=' + self.local_ip + ' local_port=' + self.local_port);

    var rhost = 'client ' + ((self.remote_host) ? self.remote_host + ' ' : '') +
                '[' + self.remote_ip + ']';
    self.client.on('end', function() {
        if (self.state >= states.STATE_DISCONNECTING) return;
        self.remote_close = true;
        self.loginfo(rhost + ' half closed connection');
        self.fail();
    });

    self.client.on('close', function(has_error) {
        if (self.state >= states.STATE_DISCONNECTING) return;
        self.remote_close = true;
        self.loginfo(rhost + ' dropped connection');
        self.fail();
    });

    self.client.on('error', function (err) {
        if (self.state >= states.STATE_DISCONNECTING) return;
        self.loginfo(rhost + ' connection error: ' + err);
        self.fail();
    });

    self.client.on('timeout', function () {
        if (self.state >= states.STATE_DISCONNECTING) return;
        self.respond(421, 'timeout', function () {
            self.fail(rhost + ' connection timed out');
        });
    });

    self.client.on('data', function (data) {
        self.process_data(data);
    });

    if (haproxy_hosts.some(function (element, index, array) {
        return ipaddr.IPv4.parse(self.remote_ip).match(element[0], element[1]);
    })) {
        self.proxy = true;
        // Wait for PROXY command
        self.proxy_timer = setTimeout(function () {
            self.respond(421, 'PROXY timeout', function () {
                self.disconnect();
            });
        }, 30 * 1000);
    }
    else {
        plugins.run_hooks('lookup_rdns', self);
    }
}

function Connection(client, server) {
    this.client = client;
    this.server = server;
    this.local_ip = null;
    this.local_port = null;
    this.remote_ip = null;
    this.remote_host = null;
    this.remote_port = null;
    this.remote_info = null;
    this.current_data = null;
    this.current_line = null;
    this.greeting = null;
    this.hello_host = null;
    this.using_tls = server.has_tls ? true : false;
    this.state = states.STATE_PAUSE;
    this.prev_state = null;
    this.loop_code = null;
    this.loop_msg = null;
    this.uuid = uuid();
    this.notes = {};
    this.transaction = null;
    this.tran_count = 0;
    this.capabilities = null;
    this.early_talker_delay = config.get('early_talker.pause') || config.get('early_talker_delay') || 1000;
    this.banner_includes_uuid = config.get('banner_includes_uuid') ? true : false;
    this.deny_includes_uuid = config.get('deny_includes_uuid') || null;
    this.early_talker = 0;
    this.pipelining = 0;
    this.relaying = false;
    this.esmtp = false;
    this.last_response = null;
    this.remote_close = false;
    this.hooks_to_run = [];
    this.start_time = Date.now();
    this.last_reject = '';
    this.max_bytes = config.get('databytes');
    this.totalbytes = 0;
    this.rcpt_count = {
        accept:   0,
        tempfail: 0,
        reject:   0,
    };
    this.msg_count = {
        accept:   0,
        tempfail: 0,
        reject:   0,
    };
    this.data_post_start = null;
    this.proxy = false;
    this.proxy_timer = false;
    this.max_line_length = config.get('max_line_length') || 512;
    this.max_data_line_length = config.get('max_data_line_length') || 992;
    this.results = new ResultStore(this);
    setupClient(this);
}

exports.Connection = Connection;

exports.createConnection = function(client, server) {
    var s = new Connection(client, server);
    return s;
};

Connection.prototype.process_line = function (line) {
    var self = this;

    if (this.state >= states.STATE_DISCONNECTING) {
        if (logger.would_log(logger.LOGPROTOCOL)) {
            this.logprotocol("C: (after-disconnect): " + this.current_line + ' state=' + this.state);
        }
        this.loginfo("data after disconnect from " + this.remote_ip);
        return;
    }

    if (this.state === states.STATE_DATA) {
        if (logger.would_log(logger.LOGDATA)) {
            this.logdata("C: " + line);
        }
        this.accumulate_data(line);
        return;
    }

    this.current_line = line.toString('binary').replace(/\r?\n/, '');
    if (logger.would_log(logger.LOGPROTOCOL)) {
        this.logprotocol("C: " + this.current_line + ' state=' + this.state);
    }

    // Check for non-ASCII characters
    if (/[^\x00-\x7F]/.test(this.current_line)) {
        return this.respond(501, 'Syntax error (8-bit characters not allowed)');
    }

    if (this.state === states.STATE_CMD) {
        this.state = states.STATE_PAUSE_SMTP;
        var matches = /^([^ ]*)( +(.*))?$/.exec(this.current_line);
        if (!matches) {
            return plugins.run_hooks('unrecognized_command', this, this.current_line);
        }
        var method = "cmd_" + matches[1].toLowerCase();
        var remaining = matches[3] || '';
        if (this[method]) {
            try {
                this[method](remaining);
            }
            catch (err) {
                if (err.stack) {
                    var c = this;
                    c.logerror(method + " failed: " + err);
                    err.stack.split("\n").forEach(c.logerror);
                }
                else {
                    this.logerror(method + " failed: " + err);
                }
                this.respond(421, "Internal Server Error", function() {
                    self.disconnect();
                });
            }
        }
        else {
            // unrecognised command
            matches.splice(0,1);
            matches.splice(1,1);
            plugins.run_hooks('unrecognized_command', this, matches);
        }
    }
    else if (this.state === states.STATE_LOOP) {
        // Allow QUIT
        if (this.current_line.toUpperCase() === 'QUIT') {
            this.cmd_quit();
        }
        else {
            this.respond(this.loop_code, this.loop_msg);
        }
    }
    else {
        throw new Error('unknown state ' + this.state);
    }
};

Connection.prototype.process_data = function (data) {
    if (this.state >= states.STATE_DISCONNECTING) {
        this.logwarn("data after disconnect from " + this.remote_ip);
        return;
    }

    if (!this.current_data || !this.current_data.length) {
        this.current_data = data;
    }
    else {
        // Data left over in buffer
        var buf = Buffer.concat(
            [ this.current_data, data ],
            (this.current_data.length + data.length)
        );
        this.current_data = buf;
    }

    this._process_data();
};

Connection.prototype._process_data = function() {
    var self = this;
    // We *must* detect disconnected connections here as the state
    // only transitions to states.STATE_CMD in the respond function below.
    // Otherwise if multiple commands are pipelined and then the
    // connection is dropped; we'll end up in the function forever.
    if (this.state >= states.STATE_DISCONNECTING) return;

    var maxlength;
    if (this.state === states.STATE_PAUSE_DATA || this.state === states.STATE_DATA) {
        maxlength = this.max_data_line_length;
    }
    else {
        maxlength = this.max_line_length;
    }

    var offset;
    while (this.current_data && ((offset = indexOfLF(this.current_data, maxlength)) !== -1)) {
        if (this.state === states.STATE_PAUSE_DATA) {
            return;
        }
        var this_line = this.current_data.slice(0, offset+1);
        // Hack: bypass this code to allow HAProxy's PROXY extension
        if (this.state === states.STATE_PAUSE && this.proxy && /^PROXY /.test(this_line)) {
            if (this.proxy_timer) clearTimeout(this.proxy_timer);
            this.state = states.STATE_CMD;
            this.current_data = this.current_data.slice(this_line.length);
            this.process_line(this_line);
        }
        // Detect early_talker but allow PIPELINING extension (ESMTP)
        else if ((this.state === states.STATE_PAUSE || this.state === states.STATE_PAUSE_SMTP) && !this.esmtp) {
            // Allow EHLO/HELO to be pipelined with PROXY
            if (this.proxy && /^(?:EH|HE)LO /i.test(this_line)) return;
            if (!this.early_talker) {
                this_line = this_line.toString().replace(/\r?\n/,'');
                this.logdebug('[early_talker] state=' + this.state + ' esmtp=' + this.esmtp + ' line="' + this_line + '"');
            }
            this.early_talker = 1;
            // If you talk early, we're going to give you a delay
            setTimeout(function() { self._process_data(); }, this.early_talker_delay);
            break;
        }
        else if ((this.state === states.STATE_PAUSE || this.state === states.STATE_PAUSE_SMTP) && this.esmtp) {
            var valid = true;
            var cmd = this_line.toString('ascii').slice(0,4).toUpperCase();
            switch (cmd) {
                case 'RSET':
                case 'MAIL':
                case 'SEND':
                case 'SOML':
                case 'SAML':
                case 'RCPT':
                    // These can be anywhere in the group
                    break;
                default:
                    // Anything else *MUST* be the last command in the group
                    if (this_line.length !== this.current_data.length) {
                        valid = false;
                    }
                    break;
            }
            if (valid) {
                // Valid PIPELINING
                // We *don't want to process this yet otherwise the
                // current_data buffer will be lost.  The respond()
                // function will call this function again once it
                // has reset the state back to states.STATE_CMD and this
                // ensures that we only process one command at a
                // time.
                this.pipelining = 1;
                this.logdebug('pipeline: ' + this_line);
            }
            else {
                // Invalid pipeline sequence
                // Treat this as early talker
                if (!this.early_talker) {
                    this.logdebug('[early_talker] state=' + this.state +
                            ' esmtp=' + this.esmtp + ' line="' + this_line + '"');
                }
                this.early_talker = 1;
                setTimeout(function() { self._process_data(); }, this.early_talker_delay);
            }
            break;
        }
        else {
            this.current_data = this.current_data.slice(this_line.length);
            this.process_line(this_line);
        }
    }

    if (this.current_data && (this.current_data.length > maxlength) &&
            (indexOfLF(this.current_data, maxlength) === -1)) {
        if (this.state !== states.STATE_DATA       &&
            this.state !== states.STATE_PAUSE_DATA)
        {
            // In command mode, reject:
            this.client.pause();
            this.current_data = null;
            return this.respond(521, "Command line too long", function () {
                self.disconnect();
            });
        }
        else {
            this.loginfo('DATA line length (' + this.current_data.length + ') exceeds limit of ' + maxlength + ' bytes');
            this.transaction.notes.data_line_length_exceeded = true;
            var b = Buffer.concat([
                this.current_data.slice(0, maxlength - 2),
                new Buffer("\r\n ", 'utf8'),
                this.current_data.slice(maxlength - 2)
            ], this.current_data.length + 3);
            this.current_data = b;
            return this._process_data();
        }
    }
};

Connection.prototype.respond = function(code, msg, func) {
    var uuid = '';
    var messages;

    if (this.state === states.STATE_DISCONNECTED) {
        if (func) func();
        return;
    }
    // Check to see if DSN object was passed in
    if (typeof msg === 'object' && msg.constructor.name === 'DSN') {
        // Override
        code = msg.code;
        msg = msg.reply;
    }
    if (!(Array.isArray(msg))) {
        // msg not an array, make it so:
        messages = msg.toString().split(/\n/).filter(function (msg) { return /\S/.test(msg);});
    } else {
        // copy
        messages = msg.slice().filter(function (msg) { return /\S/.test(msg);});
    }

    if (code >= 400) {
        this.last_reject = code + ' ' + messages.join(' ');
        if (this.deny_includes_uuid) {
            uuid = (this.transaction || this).uuid;
            if (this.deny_includes_uuid > 1) {
                uuid = uuid.substr(0, this.deny_includes_uuid);
            }
        }
    }

    var mess;
    var buf = '';

    while (mess = messages.shift()) {
        var line = code + (messages.length ? "-" : " ") +
            (uuid ? '[' + uuid + '] ' : '' ) + mess;
        this.logprotocol("S: " + line);
        buf = buf + line + "\r\n";
    }

    try {
        this.client.write(buf);
    }
    catch (err) {
        return this.fail("Writing response: " + buf + " failed: " + err);
    }

    // Store the last response
    this.last_response = buf;

    // Don't change loop state
    if (this.state !== states.STATE_LOOP) {
        this.state = states.STATE_CMD;
    }

    // Run optional closure before handling and further commands
    if (func) func();

    // Process any buffered commands (PIPELINING)
    this._process_data();
};

Connection.prototype.fail = function (err) {
    if (err) this.logwarn(err);
    this.hooks_to_run = [];
    this.disconnect();
};

Connection.prototype.disconnect = function() {
    if (this.state >= states.STATE_DISCONNECTING) return;
    var self = this;
    self.state = states.STATE_DISCONNECTING;
    this.reset_transaction(function () {
        plugins.run_hooks('disconnect', self);
    });
};

Connection.prototype.disconnect_respond = function () {
    var logdetail = [
        'ip='    + this.remote_ip,
        'rdns="' + ((this.remote_host) ? this.remote_host : '') + '"',
        'helo="' + ((this.hello_host) ? this.hello_host : '') + '"',
        'relay=' + (this.relaying ? 'Y' : 'N'),
        'early=' + (this.early_talker ? 'Y' : 'N'),
        'esmtp=' + (this.esmtp ? 'Y' : 'N'),
        'tls='   + (this.using_tls ? 'Y' : 'N'),
        'pipe='  + (this.pipelining ? 'Y' : 'N'),
        'txns='  + this.tran_count,
        'rcpts=' + this.rcpt_count.accept + '/' +
                   this.rcpt_count.tempfail + '/' +
                   this.rcpt_count.reject,
        'msgs='  + this.msg_count.accept + '/' +
                   this.msg_count.tempfail + '/' +
                   this.msg_count.reject,
        'bytes=' + this.totalbytes,
        'lr="'   + ((this.last_reject) ? this.last_reject : '') + '"',
        'time='  + (Date.now() - this.start_time)/1000,
    ];
    this.lognotice('disconnect ' + logdetail.join(' '));
    this.state = states.STATE_DISCONNECTED;
    this.client.end();
};

Connection.prototype.get_capabilities = function() {
    var capabilities = [];

    return capabilities;
};

Connection.prototype.tran_uuid = function () {
    this.tran_count++;
    return this.uuid + '.' + this.tran_count;
};

Connection.prototype.reset_transaction = function(cb) {
    if (this.transaction && this.transaction.resetting === false) {
        this.transaction.resetting = true;
        plugins.run_hooks('reset_transaction', this, cb);
    }
    else {
        this.transaction = null;
        if (cb) cb();
    }
};

Connection.prototype.reset_transaction_respond = function (retval, msg, cb) {
    if (this.transaction) {
        this.transaction.message_stream.destroy();
        this.transaction = null;
    }
    if (cb) cb();
};

Connection.prototype.init_transaction = function(cb) {
   var self = this;
   this.reset_transaction(function () {
       self.transaction = trans.createTransaction(self.tran_uuid());
       // Catch any errors from the message_stream
       self.transaction.message_stream.on('error', function (err) {
           self.logcrit('message_stream error: ' + err.message);
           self.respond('421', 'Internal Server Error', function () {
               self.disconnect();
           });
       });
       self.transaction.results = new ResultStore(self);
       if (cb) cb();
    });
};

Connection.prototype.loop_respond = function (code, msg) {
    if (this.state >= states.STATE_DISCONNECTING) return;
    this.state = states.STATE_LOOP;
    this.loop_code = code;
    this.loop_msg = msg;
    this.respond(code, msg);
};

Connection.prototype.pause = function () {
    var self = this;
    if (self.state >= states.STATE_DISCONNECTING) return;
    self.client.pause();
    if (self.state !== states.STATE_PAUSE_DATA) self.prev_state = self.state;
    self.state = states.STATE_PAUSE_DATA;
};

Connection.prototype.resume = function () {
    var self = this;
    if (self.state >= states.STATE_DISCONNECTING) return;
    self.client.resume();
    if (self.prev_state) {
        self.state = self.prev_state;
        self.prev_state = null;
    }
    process.nextTick(function () { self._process_data();});
};

/////////////////////////////////////////////////////////////////////////////
// SMTP Responses

Connection.prototype.lookup_rdns_respond = function (retval, msg) {
    var self = this;
    switch(retval) {
        case constants.ok:
                this.remote_host = msg || 'Unknown';
                this.remote_info = this.remote_info || this.remote_host;
                plugins.run_hooks('connect', this);
                break;
        case constants.deny:
                this.loop_respond(554, msg || "rDNS Lookup Failed");
                break;
        case constants.denydisconnect:
        case constants.disconnect:
                this.respond(554, msg || "rDNS Lookup Failed", function () {
                    self.disconnect();
                });
                break;
        case constants.denysoft:
                this.loop_respond(421, msg || "rDNS Temporary Failure");
                break;
        case constants.denysoftdisconnect:
                this.respond(421, msg || "rDNS Temporary Failure", function () {
                    self.disconnect();
                });
                break;
        default:
                dns.reverse(this.remote_ip, function(err, domains) {
                    self.rdns_response(err, domains);
                });
    }
};

Connection.prototype.rdns_response = function (err, domains) {
    if (err) {
        switch (err.code) {
            case dns.NXDOMAIN: this.remote_host = 'NXDOMAIN'; break;
            default:           this.remote_host = 'DNSERROR'; break;
        }
    }
    else {
        this.remote_host = domains[0] || 'Unknown';
    }
    this.remote_info = this.remote_info || this.remote_host;
    plugins.run_hooks('connect', this);
};

Connection.prototype.unrecognized_command_respond = function(retval, msg) {
    var self = this;
    switch(retval) {
        case constants.ok:
                // response already sent, cool...
                break;
        case constants.next_hook:
                plugins.run_hooks(msg, this);
                break;
        case constants.deny:
                this.respond(500, msg || "Unrecognized command");
                break;
        case constants.denydisconnect:
                this.respond(521, msg || "Unrecognized command", function () {
                    self.disconnect();
                });
                break;
        default:
                this.respond(500, msg || "Unrecognized command");
    }
};

Connection.prototype.connect_respond = function(retval, msg) {
    var self = this;
    // RFC 5321 Section 4.3.2 states that the only valid SMTP codes here are:
    // 220 = Service ready
    // 554 = Transaction failed (no SMTP service here)
    // 421 = Service shutting down and closing transmission channel
    switch (retval) {
        case constants.deny:
                this.loop_respond(554, msg || "Your mail is not welcome here");
                break;
        case constants.denydisconnect:
        case constants.disconnect:
                this.respond(554, msg || "Your mail is not welcome here", function() {
                    self.disconnect();
                });
                break;
        case constants.denysoft:
                this.loop_respond(421, msg || "Come back later");
                break;
        case constants.denysoftdisconnect:
                this.respond(421, msg || "Come back later", function() {
                    self.disconnect();
                });
                break;
        default:
                var greeting = config.get('smtpgreeting', 'list');
                if (greeting.length) {
                    // RFC5321 section 4.2
                    // Hostname/domain should appear after the 220
                    greeting[0] = config.get('me') + ' ESMTP ' + greeting[0];
                    if (this.banner_includes_uuid) {
                        greeting[0] += ' (' + this.uuid + ')';
                    }
                }
                else {
                    greeting = config.get('me') + " ESMTP Haraka " + version + " ready";
                    if (this.banner_includes_uuid) {
                        greeting += ' (' + this.uuid + ')';
                    }
                }
                this.respond(220, msg || greeting);
    }
};

Connection.prototype.helo_respond = function(retval, msg) {
    var self = this;
    switch (retval) {
        case constants.deny:
                this.respond(550, msg || "HELO denied", function() {
                    self.greeting = null;
                    self.hello_host = null;
                });
                break;
        case constants.denydisconnect:
                this.respond(550, msg || "HELO denied", function() {
                    self.disconnect();
                });
                break;
        case constants.denysoft:
                this.respond(450, msg || "HELO denied", function() {
                    self.greeting = null;
                    self.hello_host = null;
                });
                break;
        case constants.denysoftdisconnect:
                this.respond(450, msg || "HELO denied", function() {
                    self.disconnect();
                });
                break;
        default:
                // RFC5321 section 4.1.1.1
                // Hostname/domain should appear after 250
                this.respond(250, config.get('me') + " Hello " +
                    ((this.remote_host && this.remote_host !== 'DNSERROR' &&
                    this.remote_host !== 'NXDOMAIN') ? this.remote_host + ' ' : '') +
                    "[" + this.remote_ip + "]" +
                    ", Haraka is at your service.");
    }
};

Connection.prototype.ehlo_respond = function(retval, msg) {
    var self = this;
    switch (retval) {
        case constants.deny:
                this.respond(550, msg || "EHLO denied", function() {
                    self.greeting = null;
                    self.hello_host = null;
                });
                break;
        case constants.denydisconnect:
                this.respond(550, msg || "EHLO denied", function() {
                    self.disconnect();
                });
                break;
        case constants.denysoft:
                this.respond(450, msg || "EHLO denied", function() {
                    self.greeting = null;
                    self.hello_host = null;
                });
                break;
        case constants.denysoftdisconnect:
                this.respond(450, msg || "EHLO denied", function () {
                    self.disconnect();
                });
                break;
        default:
                // RFC5321 section 4.1.1.1
                // Hostname/domain should appear after 250
                var response = [config.get('me') + " Hello " +
                                ((this.remote_host && this.remote_host !== 'DNSERROR' &&
                                this.remote_host !== 'NXDOMAIN') ? this.remote_host + ' ' : '') +
                                "[" + this.remote_ip + "]" +
                                ", Haraka is at your service.",
                                "PIPELINING",
                                "8BITMIME",
                                ];

                var databytes = parseInt(config.get('databytes')) || 0;
                response.push("SIZE " + databytes);

                this.capabilities = response;

                plugins.run_hooks('capabilities', this);
                this.esmtp = true;
    }
};

Connection.prototype.capabilities_respond = function (retval, msg) {
    this.respond(250, this.capabilities);
};

Connection.prototype.quit_respond = function(retval, msg) {
    var self = this;
    this.respond(221, msg || config.get('me') + " closing connection. Have a jolly good day.", function() {
        self.disconnect();
    });
};

Connection.prototype.vrfy_respond = function(retval, msg) {
    var self = this;
    switch (retval) {
        case constants.deny:
                this.respond(550, msg || "Access Denied", function() {
                    self.reset_transaction();
                });
                break;
        case constants.denydisconnect:
                this.respond(550, msg || "Access Denied", function() {
                    self.disconnect();
                });
                break;
        case constants.denysoft:
                this.respond(450, msg || "Lookup Failed", function() {
                    self.reset_transaction();
                });
                break;
        case constants.denysoftdisconnect:
                this.respond(450, msg || "Lookup Failed", function() {
                    self.disconnect();
                });
                break;
        case constants.ok:
                this.respond(250, msg || "User OK");
                break;
        default:
                this.respond(252, "Just try sending a mail and we'll see how it turns out...");
    }
};

Connection.prototype.noop_respond = function(retval, msg) {
    var self = this;
    switch (retval) {
        case constants.deny:
                this.respond(500, msg || "Stop wasting my time");
                break;
        case constants.denydisconnect:
                this.respond(500, msg || "Stop wasting my time", function() {
                    self.disconnect();
                });
                break;
        default:
                this.respond(250, "OK");
    }
};

Connection.prototype.rset_respond = function(retval, msg) {
    // We ignore any plugin responses
    var self = this;
    this.respond(250, "OK", function() {
        self.reset_transaction();
    });
};

Connection.prototype.mail_respond = function(retval, msg) {
    var self = this;
    if (!this.transaction) {
        this.logerror("mail_respond found no transaction!");
        return;
    }
    var sender = this.transaction.mail_from;
    var dmsg   = "sender " + sender.format();
    this.lognotice(dmsg + ' ' + [
        'code=' + constants.translate(retval),
        'msg="' + (msg || '') + '"',
    ].join(' '));
    switch (retval) {
        case constants.deny:
                this.respond(550, msg || dmsg + " denied", function() {
                    self.reset_transaction();
                });
                break;
        case constants.denydisconnect:
                this.respond(550, msg || dmsg + " denied", function() {
                    self.disconnect();
                });
                break;
        case constants.denysoft:
                this.respond(450, msg || dmsg + " denied", function() {
                    self.reset_transaction();
                });
                break;
        case constants.denysoftdisconnect:
                this.respond(450, msg || dmsg + " denied", function() {
                    self.disconnect();
                });
                break;
        default:
                this.respond(250, msg || dmsg + " OK");
    }
};

Connection.prototype.rcpt_ok_respond = function (retval, msg) {
    var self = this;
    if (!this.transaction) {
        this.logerror("rcpt_ok_respond found no transaction!");
        return;
    }
    var rcpt = this.transaction.rcpt_to[this.transaction.rcpt_to.length - 1];
    var dmsg = "recipient " + rcpt.format();
    this.lognotice(dmsg + ' ' + [
        'code=' + constants.translate(retval),
        'msg="' + (msg || '') + '"',
        'sender="' + this.transaction.mail_from.address() + '"',
    ].join(' '));
    switch (retval) {
        case constants.deny:
                this.respond(550, msg || dmsg + " denied", function() {
                    self.transaction.rcpt_count.reject++;
                    self.rcpt_count.reject++;
                    self.transaction.rcpt_to.pop();
                });
                break;
        case constants.denydisconnect:
                this.respond(550, msg || dmsg + " denied", function() {
                    self.transaction.rcpt_count.reject++;
                    self.rcpt_count.reject++;
                    self.disconnect();
                });
                break;
        case constants.denysoft:
                this.respond(450, msg || dmsg + " denied", function() {
                    self.transaction.rcpt_count.tempfail++;
                    self.rcpt_count.tempfail++;
                    self.transaction.rcpt_to.pop();
                });
                break;
        case constants.denysoftdisconnect:
                this.respond(450, msg || dmsg + " denied", function() {
                    self.transaction.rcpt_count.tempfail++;
                    self.rcpt_count.tempfail++;
                    self.disconnect();
                });
                break;
        default:
                this.respond(250, msg || dmsg + " OK", function() {
                    self.rcpt_count.accept++;
                    self.transaction.rcpt_count.accept++;
                });
    }
};

Connection.prototype.rcpt_respond = function(retval, msg) {
    if (retval === constants.cont && this.relaying) {
        retval = constants.ok;
    }

    var self = this;
    if (!this.transaction) {
        this.logerror("rcpt_respond found no transaction!");
        return;
    }
    var rcpt = this.transaction.rcpt_to[this.transaction.rcpt_to.length - 1];
    var dmsg = "recipient " + rcpt.format();
    if (retval !== constants.ok) {
        this.lognotice(dmsg + ' ' + [
            'code=' + constants.translate(retval),
            'msg="' + (msg || '') + '"',
            'sender="' + this.transaction.mail_from.address() + '"',
        ].join(' '));
    }
    switch (retval) {
        case constants.deny:
                this.respond(550, msg || dmsg + " denied", function() {
                    self.transaction.rcpt_count.reject++;
                    self.rcpt_count.reject++;
                    self.transaction.rcpt_to.pop();
                });
                break;
        case constants.denydisconnect:
                this.respond(550, msg || dmsg + " denied", function() {
                    self.transaction.rcpt_count.reject++;
                    self.rcpt_count.reject++;
                    self.disconnect();
                });
                break;
        case constants.denysoft:
                this.respond(450, msg || dmsg + " denied", function() {
                    self.transaction.rcpt_count.tempfail++;
                    self.rcpt_count.tempfail++;
                    self.transaction.rcpt_to.pop();
                });
                break;
        case constants.denysoftdisconnect:
                this.respond(450, msg || dmsg + " denied", function() {
                    self.transaction.rcpt_count.tempfail++;
                    self.rcpt_count.tempfail++;
                    self.disconnect();
                });
                break;
        case constants.ok:
                plugins.run_hooks('rcpt_ok', this, rcpt);
                break;
        default:
                if (retval !== constants.cont) {
                    this.logalert("No plugin determined if relaying was allowed");
                }
                this.respond(550, "I cannot deliver mail for " + rcpt.format(), function() {
                    self.transaction.rcpt_count.reject++;
                    self.rcpt_count.reject++;
                    self.transaction.rcpt_to.pop();
                });
    }
};

/////////////////////////////////////////////////////////////////////////////
// HAProxy support

Connection.prototype.cmd_proxy = function (line) {
    var self = this;

    if (!this.proxy) {
        this.respond(421, 'PROXY not allowed from ' + this.remote_ip);
        return this.disconnect();
    }

    var match;
    if (!(match = /(TCP4|TCP6|UNKNOWN) (\S+) (\S+) (\d+) (\d+)$/.exec(line))) {
        this.respond(421, 'Invalid PROXY format');
        return this.disconnect();
    }
    var proto = match[1];
    var src_ip = match[2];
    var dst_ip = match[3];
    var src_port = match[4];
    var dst_port = match[5];
    // Validate source/destination IP
    switch (proto) {
        case 'TCP4':
            if (ipaddr.IPv4.isValid(src_ip) && ipaddr.IPv4.isValid(dst_ip)) {
                break;
            }
        case 'TCP6':
            if (ipaddr.IPv6.isValid(src_ip) && ipaddr.IPv6.isValid(dst_ip)) {
                break;
            }
        // case 'UNKNOWN':
        default:
            this.respond(421, 'Invalid PROXY format');
            return this.disconnect();
    }

    // Apply changes
    this.loginfo('HAProxy: proto=' + proto +
        ' src_ip=' + src_ip + ':' + src_port +
        ' dst_ip=' + dst_ip + ':' + dst_port);
    this.reset_transaction(function () {
        self.relaying = false;
        self.remote_ip = src_ip;
        self.remote_host = undefined;
        self.hello_host = undefined;
        plugins.run_hooks('lookup_rdns', self);
    });
};


/////////////////////////////////////////////////////////////////////////////
// SMTP Commands

Connection.prototype.cmd_helo = function(line) {
    var self = this;
    var results = (String(line)).split(/ +/);
    var host = results[0];
    if (!host) {
        return this.respond(501, "HELO requires domain/address - see RFC-2821 4.1.1.1");
    }

    // We could check this.hello_host === host here
    // But this is probably best done in a plugin.

    this.reset_transaction(function () {
        self.greeting = 'HELO';
        self.hello_host = host;
        plugins.run_hooks('helo', self, host);
    });
};

Connection.prototype.cmd_ehlo = function(line) {
    var self = this;
    var results = (String(line)).split(/ +/);
    var host = results[0];
    if (!host) {
        return this.respond(501, "EHLO requires domain/address - see RFC-2821 4.1.1.1");
    }

    // We could check this.hello_host === host here
    // But this is probably best done in a plugin.

    this.reset_transaction(function () {
        self.greeting = 'EHLO';
        self.hello_host = host;
        plugins.run_hooks('ehlo', self, host);
    });
};

Connection.prototype.cmd_quit = function(args) {
    // RFC 5321 Section 4.3.2
    // QUIT does not accept arguments
    if (args) {
        return this.respond(501, "Syntax error");
    }
    plugins.run_hooks('quit', this);
};

Connection.prototype.cmd_rset = function(args) {
    // RFC 5321 Section 4.3.2
    // RSET does not accept arguments
    if (args) {
        return this.respond(501, "Syntax error");
    }
    plugins.run_hooks('rset', this);
};

Connection.prototype.cmd_vrfy = function(line) {
    // I'm not really going to support this except via plugins
    plugins.run_hooks('vrfy', this);
};

Connection.prototype.cmd_noop = function() {
    plugins.run_hooks('noop', this);
};

Connection.prototype.cmd_help = function() {
    this.respond(250, "Not implemented");
};

Connection.prototype.cmd_mail = function(line) {
    if (!this.hello_host) {
        return this.respond(503, 'Use EHLO/HELO before MAIL');
    }
    // Require authentication on connections to port 587 & 465
    if (!this.relaying && [587,465].indexOf(this.local_port) !== -1) {
        return this.respond(550, 'Authentication required');
    }
    var results;
    var from;
    try {
        results = rfc1869.parse("mail", line, config.get('strict_rfc1869') && !this.relaying);
        from    = new Address (results.shift());
    }
    catch (err) {
        if (err.stack) {
            this.logerror(err.stack.split(/\n/)[0]);
        }
        else {
            this.logerror(err);
        }
        // Explicitly handle out-of-disk space errors
        if (err.code === 'ENOSPC') {
            return this.respond(452, 'Internal Server Error');
        }
        else {
            return this.respond(501, ["Command parsing failed", err]);
        }
    }

    // Get rest of key=value pairs
    var params = {};
    results.forEach(function(param) {
        var kv = param.match(/^([^=]+)(?:=(.+))?$/);
        if (kv)
            params[kv[1].toUpperCase()] = kv[2] || null;
    });

    // Parameters are only valid if EHLO was sent
    if (!this.esmtp && Object.keys(params).length > 0) {
        return this.respond(555, 'Invalid command parameters');
    }

    // Handle SIZE extension
    if (params && params.SIZE && params.SIZE > 0) {
        var databytes = config.get('databytes');
        if (databytes && databytes > 0 && params.SIZE > databytes) {
            return this.respond(550, 'Message too big!');
        }
    }

    var self = this;
    this.init_transaction(function () {
        self.transaction.mail_from = from;
        plugins.run_hooks('mail', self, [from, params]);
    });
};

Connection.prototype.cmd_rcpt = function(line) {
    if (!this.transaction || !this.transaction.mail_from) {
        return this.respond(503, "Use MAIL before RCPT");
    }

    var results;
    var recip;
    try {
        results = rfc1869.parse("rcpt", line, config.get('strict_rfc1869') && !this.relaying);
        recip   = new Address(results.shift());
    }
    catch (err) {
        if (err.stack) {
            this.logerror(err.stack.split(/\n/)[0]);
        }
        else {
            this.logerror(err);
        }
        // Explicitly handle out-of-disk space errors
        if (err.code === 'ENOSPC') {
            return this.respond(452, 'Internal Server Error');
        }
        else {
            return this.respond(501, ["Command parsing failed", err]);
        }
    }

    // Get rest of key=value pairs
    var params = {};
    results.forEach(function(param) {
        var kv = param.match(/^([^=]+)(?:=(.+))?$/);
        if (kv)
            params[kv[1].toUpperCase()] = kv[2] || null;
    });

    // Parameters are only valid if EHLO was sent
    if (!this.esmtp && Object.keys(params).length > 0) {
        return this.respond(555, 'Invalid command parameters');
    }

    this.transaction.rcpt_to.push(recip);
    plugins.run_hooks('rcpt', this, [recip, params]);
};

Connection.prototype.received_line = function() {
    var smtp = this.greeting === 'EHLO' ? 'ESMTP' : 'SMTP';
    // Implement RFC3848
    if (this.using_tls)  smtp = smtp + 'S';
    if (this.authheader) smtp = smtp + 'A';
    // sslheader only populated with node.js >= 0.8
    var sslheader;
    if (this.notes.tls && this.notes.tls.cipher) {
        sslheader = '(version=' + this.notes.tls.cipher.version +
            ' cipher=' + this.notes.tls.cipher.name +
            ' verify=' + ((this.notes.tls.authorized) ? 'OK' : 
            ((this.notes.tls.authorizationError &&
              this.notes.tls.authorizationError.message === 'UNABLE_TO_GET_ISSUER_CERT') ? 'NO' : 'FAIL')) + ')';
    }
    return [
        'from ',
        this.hello_host, ' (',
        // If no rDNS, don't display it
        ((!/^(?:DNSERROR|NXDOMAIN)/.test(this.remote_info)) ? this.remote_info + ' ' : ''),
        '[', this.remote_ip, '])',
        "\n\t",
        'by ', config.get('me'), ' (Haraka/', version, ') with ', smtp,
        ' id ', this.transaction.uuid,
        "\n\t",
        'envelope-from ', this.transaction.mail_from.format(),
        ((this.authheader) ? ' ' + this.authheader.replace(/\r?\n\t?$/, '') : ''),
        ((sslheader) ? "\n\t" + sslheader.replace(/\r?\n\t?$/,'') : ''),
        ";\n\t", date_to_str(new Date())
    ].join('');
};

Connection.prototype.auth_results = function(message) {
    // http://tools.ietf.org/search/rfc7001
    var has_tran = (this.transaction && this.transaction.notes) ? true : false;

    // initialize connection note
    if (!this.notes.authentication_results) {
        this.notes.authentication_results = [];
    }

    // initialize transaction note, if possible
    if (has_tran === true && !this.transaction.notes.authentication_results) {
        this.transaction.notes.authentication_results = [];
    }

    // if message, store it in the appropriate note
    if (message) {
        if (has_tran === true) {
            this.transaction.notes.authentication_results.push(message);
        }
        else {
            this.notes.authentication_results.push(message);
        }
    }

    // assemble the new header
    var header = [ config.get('me') ];
    header = header.concat(this.notes.authentication_results);
    if (has_tran === true) {
        header = header.concat(this.transaction.notes.authentication_results);
    }
    if (header.length === 1) return '';  // no results
    return header.join('; ');
};

Connection.prototype.auth_results_clean = function() {
    // move any existing Auth-Res headers to Original-Auth-Res headers
    // http://tools.ietf.org/html/draft-kucherawy-original-authres-00.html
    var ars = this.transaction.header.get_all('Authentication-Results');
    if (ars.length === 0) return;

    for (var i=0; i < ars.length; i++) {
        this.transaction.remove_header( ars[i] );
        this.transaction.add_header('Original-Authentication-Results', ars[i]);
    }
    this.logdebug("Authentication-Results moved to Original-Authentication-Results");
};

Connection.prototype.cmd_data = function(args) {
    // RFC 5321 Section 4.3.2
    // DATA does not accept arguments
    if (args) {
        return this.respond(501, "Syntax error");
    }
    if (!this.transaction) {
        return this.respond(503, "MAIL required first");
    }
    if (!this.transaction.rcpt_to.length) {
        return this.respond(503, "RCPT required first");
    }

    this.accumulate_data('Received: ' + this.received_line() + "\r\n");
    this.auth_results_clean();   // rename old A-R headers
    var ar_field = this.auth_results();  // assemble new one
    if (ar_field) this.transaction.add_header('Authentication-Results', ar_field);
    plugins.run_hooks('data', this);
};

Connection.prototype.data_respond = function(retval, msg) {
    var self = this;
    var cont = 0;
    switch (retval) {
        case constants.deny:
                this.respond(554, msg || "Message denied", function() {
                    self.reset_transaction();
                });
                break;
        case constants.denydisconnect:
                this.respond(554, msg || "Message denied", function() {
                    self.disconnect();
                });
                break;
        case constants.denysoft:
                this.respond(451, msg || "Message denied", function() {
                    self.reset_transaction();
                });
                break;
        case constants.denysoftdisconnect:
                this.respond(451, msg || "Message denied", function() {
                    self.disconnect();
                });
                break;
        default:
                cont = 1;
    }

    if (!cont) {
        return;
    }

    // We already checked for MAIL/RCPT in cmd_data
    this.respond(354, "go ahead, make my day", function() {
        // OK... now we get the data
        self.state = states.STATE_DATA;
        self.transaction.data_bytes = 0;
    });
};

Connection.prototype.accumulate_data = function(line) {
    var self = this;

    this.transaction.data_bytes += line.length;

    // Look for .\r\n
    if (line.length === 3 &&
        line[0] === 0x2e &&
        line[1] === 0x0d &&
        line[2] === 0x0a)
    {
        self.data_done();
        return;
    }

    // Look for .\n
    if (line.length === 2 &&
        line[0] === 0x2e &&
        line[1] === 0x0a)
    {
        this.logerror('Client sent bare line-feed - .\\n rather than .\\r\\n');
        this.respond(451, "Bare line-feed; see http://haraka.github.com/barelf.html", function() {
            self.reset_transaction();
        });
        return;
    }

    // Stop accumulating data as we're going to reject at dot.
    if (this.max_bytes && this.transaction.data_bytes > this.max_bytes) {
        return;
    }

    this.transaction.add_data(line);
};

Connection.prototype.data_done = function() {
    var self = this;
    this.state = states.STATE_CMD;
    this.pause();
    // this.state = states.STATE_PAUSE;
    this.totalbytes += this.transaction.data_bytes;

    // Check message size limit
    if (this.max_bytes && this.transaction.data_bytes > this.max_bytes) {
        this.logerror("Incoming message exceeded databytes size of " + this.max_bytes);
        return plugins.run_hooks('max_data_exceeded', this);
    }

    // Check max received headers count
    var max_received = config.get('max_received_count') || 100;
    if (this.transaction.header.get_all('received').length > max_received) {
        this.logerror("Incoming message had too many Received headers");
        this.respond(552, "Too many received headers - possible mail loop", function() {
            self.reset_transaction();
        });
        return;
    }

    this.transaction.end_data(function () {
        // Record the start time of this hook as we can't take too long
        // as the client will typically hang up after 2 to 3 minutes
        // despite the RFC mandating that 10 minutes should be allowed.
        self.data_post_start = Date.now();
        plugins.run_hooks('data_post', self);
    });
};

Connection.prototype.data_post_respond = function(retval, msg) {
    var mid = this.transaction.header.get('Message-ID') || '';
    this.lognotice([
        'message',
        'mid="'  + mid.replace(/\r?\n/,'') + '"',
        'size='  + this.transaction.data_bytes,
        'rcpts=' + this.transaction.rcpt_count.accept + '/' +
                   this.transaction.rcpt_count.tempfail + '/' +
                   this.transaction.rcpt_count.reject,
        'delay=' + (Date.now() - this.data_post_start)/1000,
        'code='  + constants.translate(retval),
        'msg="'  + (msg || '') + '"',
    ].join(' '));
    var ar_field = this.auth_results();  // assemble A-R header
    if (ar_field) {
        this.transaction.remove_header('Authentication-Results');
        this.transaction.add_leading_header('Authentication-Results', ar_field);
    }
    var self = this;
    switch (retval) {
        case constants.deny:
                this.respond(552, msg || "Message denied", function() {
                    self.msg_count.reject++;
                    self.reset_transaction(function () { self.resume(); });
                });
                break;
        case constants.denydisconnect:
                this.respond(552, msg || "Message denied", function() {
                    self.msg_count.reject++;
                    self.disconnect();
                });
                break;
        case constants.denysoft:
                this.respond(452, msg || "Message denied temporarily", function() {
                    self.msg_count.tempfail++;
                    self.reset_transaction(function () { self.resume(); });
                });
                break;
        case constants.denysoftdisconnect:
                this.respond(452, msg || "Message denied temporarily", function() {
                    self.msg_count.tempfail++;
                    self.disconnect();
                });
                break;
        default:
                if (this.relaying) {
                    plugins.run_hooks("queue_outbound", this);
                }
                else {
                    plugins.run_hooks("queue", this);
                }
    }
};

Connection.prototype.max_data_exceeded_respond = function (retval, msg) {
    var self = this;
    // TODO: Maybe figure out what to do with other return codes
    this.respond(retval === constants.denysoft ? 450 : 550, "Message too big!", function() {
        self.reset_transaction();
    });
};

Connection.prototype.queue_outbound_respond = function(retval, msg) {
    var self = this;
    if (retval !== constants.ok) {
        this.lognotice('queue code=' + constants.translate(retval) + ' msg="' + (msg || '') + '"');
    }
    switch(retval) {
        case constants.ok:
                plugins.run_hooks("queue_ok", this, msg || 'Message Queued (' + self.transaction.uuid + ')');
                break;
        case constants.deny:
                this.respond(552, msg || "Message denied", function() {
                    self.msg_count.reject++;
                    self.reset_transaction(function () { self.resume();});
                });
                break;
        case constants.denydisconnect:
                this.respond(552, msg || "Message denied", function() {
                    self.msg_count.reject++;
                    self.disconnect();
                });
                break;
        case constants.denysoft:
                this.respond(452, msg || "Message denied temporarily", function() {
                    self.msg_count.tempfail++;
                    self.reset_transaction(function () { self.resume();});
                });
                break;
        case constants.denysoftdisconnect:
                this.respond(452, msg || "Message denied temporarily", function() {
                    self.msg_count.tempfail++;
                    self.disconnect();
                });
                break;
        default:
                outbound.send_email(this.transaction, function(retval, msg) {
                    switch(retval) {
                        case constants.ok:
                                plugins.run_hooks("queue_ok", self, msg || 'Message Queued (' + self.transaction.uuid + ')');
                                break;
                        case constants.deny:
                                self.respond(552, msg || "Message denied", function() {
                                    self.msg_count.reject++;
                                    self.reset_transaction(function () { self.resume();});
                                });
                                break;
                        default:
                                self.logerror("Unrecognised response from outbound layer: " + retval + " : " + msg);
                                self.respond(552, msg || "Internal Server Error", function() {
                                    self.msg_count.reject++;
                                    self.reset_transaction(function () { self.resume();});
                                });
                    }
                });
    }
};

Connection.prototype.queue_respond = function(retval, msg) {
    var self = this;
    if (retval !== constants.ok) {
        this.lognotice('queue code=' + constants.translate(retval) + ' msg="' + (msg || '') + '"');
    }
    switch (retval) {
        case constants.ok:
                plugins.run_hooks("queue_ok", this, msg || 'Message Queued (' + self.transaction.uuid + ')');
                break;
        case constants.deny:
                this.respond(552, msg || "Message denied", function() {
                    self.msg_count.reject++;
                    self.reset_transaction(function () { self.resume();});
                });
                break;
        case constants.denydisconnect:
                this.respond(552, msg || "Message denied", function() {
                    self.msg_count.reject++;
                    self.disconnect();
                });
                break;
        case constants.denysoft:
                this.respond(452, msg || "Message denied temporarily", function() {
                    self.msg_count.tempfail++;
                    self.reset_transaction(function () { self.resume();});
                });
                break;
        case constants.denysoftdisconnect:
                this.respond(452, msg || "Message denied temporarily", function() {
                    self.msg_count.tempfail++;
                    self.disconnect();
                });
                break;
        default:
                this.respond(451, msg || "Queuing declined or disabled, try later", function() {
                    self.msg_count.tempfail++;
                    self.reset_transaction(function () { self.resume();});
                });
                break;
    }
};

Connection.prototype.queue_ok_respond = function (retval, msg, params) {
    var self = this;
    this.lognotice('queue code=' + constants.translate(retval) + ' msg="' + (params || '') + '"');
    this.respond(250, params, function() {
        self.msg_count.accept++;
        self.reset_transaction(function () { self.resume();});
    });
};
