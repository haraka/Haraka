"use strict";
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

var version  = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'))).version;

var line_regexp = /^([^\n]*\n)/;

var connection = exports;

var STATE_CMD   = 1;
var STATE_LOOP  = 2;
var STATE_DATA  = 3;
var STATE_PAUSE = 4;

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
            }
        })(key);
    }
}

function setupClient(self) {
    self.remote_ip = self.client.remoteAddress;
    self.lognotice("got connection from: " + self.remote_ip);

    self.client.on('end', function () {
        if (!self.disconnected) {
            self.remote_close = true;
            self.fail("client (" + self.remote_ip + ") closed connection");
        }
    });

    self.client.on('error', function (err) {
        if (!self.disconnected) {
            self.fail("client (" + self.remote_ip + ") closed with err: " + err);
        }
    });
    
    self.client.on('timeout', function () {
        if (!self.disconnected) {
            self.fail("client (" + self.remote_ip + ") timed out");
        }
    });
    
    self.client.on('data', function (data) {
        self.process_data(data);
    });

    plugins.run_hooks('lookup_rdns', self);
}

function Connection(client, server) {
    this.client = client;
    this.server = server;
    this.current_data = '';
    this.current_line = null;
    this.state = STATE_PAUSE;
    this.uuid = uuid();
    this.notes = {};
    this.tran_count = 0;
    this.early_talker_delay = config.get('early_talker_delay') || 1000;
    this.banner_includes_uuid = config.get('banner_includes_uuid') ? true : false;
    this.deny_includes_uuid = config.get('deny_includes_uuid') ? true : false;
    this.relaying = false;
    this.disconnected = false;
    this.esmtp = false;
    this.last_response = null;
    this.remote_close = false;
    this.hooks_to_run = [];
    
    setupClient(this);
}

exports.Connection = Connection;

exports.createConnection = function(client, server) {
    var s = new Connection(client, server);
    return s;
}

Connection.prototype.process_line = function (line) {
    if (this.state === STATE_CMD) {
        this.logprotocol("C: " + line);
        this.state = STATE_PAUSE;
        this.current_line = line.replace(/\r?\n/, '');
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
                this.respond(500, "Internal Server Error");
                this.disconnect();
            }
        }
        else {
            // unrecognised command
            matches.splice(0,1);
            matches.splice(1,1);
            plugins.run_hooks('unrecognized_command', this, matches);
        }
    }
    else if (this.state === STATE_LOOP) {
        this.logprotocol("C: " + line);
        // Allow QUIT
        if (line.replace(/\r?\n/, '').toUpperCase() === 'QUIT') {
            this.cmd_quit();
        } 
        else {
            this.respond(this.loop_code, this.loop_msg);
        }
    }
    else if (this.state === STATE_DATA) {
        this.logdata("C: " + line);
        this.accumulate_data(line);
    }
};

Connection.prototype.process_data = function (data) {
    if (this.disconnected) {
        this.logwarn("data after disconnect from " + this.remote_ip);
        return;
    }
    
    this.current_data += data;
    this._process_data();
};

Connection.prototype._process_data = function() {
    var results;
    while (results = line_regexp.exec(this.current_data)) {
        var this_line = results[1];
        if (this.state === STATE_PAUSE) {
            this.early_talker = 1;
            var self = this;
            // If you talk early, we're going to give you a delay
            setTimeout(function() { self._process_data() }, this.early_talker_delay);
            break;
        }
        this.current_data = this.current_data.slice(this_line.length);
        this.process_line(this_line);
    }
};

Connection.prototype.remote_host = function() {
    if (arguments.length) {
        this.remote_host = arguments[0];
    }
    return this.remote_host;
};

Connection.prototype.remote_ip = function() {
    if (arguments.length) {
        this.remote_ip = arguments[0];
    }
    return this.remote_ip;
};

Connection.prototype.current_line = function() {
    return this.current_line;
};

Connection.prototype.respond = function(code, msg) {
    var uuid = '';
    var messages;

    if (this.disconnected) {
        return;
    }
    // Check to see if DSN object was passed in
    if (typeof msg === 'object' && msg.constructor.name === 'DSN') {
        // Override
        code = msg.code;
        msg = msg.reply;
    }
    if (!(typeof msg === 'object' && msg.constructor.name === 'Array')) {
        // msg not an array, make it so:
        messages = [ '' + msg ];
    } else {
        // copy
        messages = msg.slice();
    }

    if (code >= 400 && this.deny_includes_uuid) {
        uuid = (this.transaction || this).uuid;
        if (this.deny_includes_uuid > 1) {
            uuid = uuid.substr(0, this.deny_includes_uuid);
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
    if (this.state !== STATE_LOOP) {
        this.state = STATE_CMD;
    }
};

Connection.prototype.fail = function (err) {
    this.logwarn(err);
    this.hooks_to_run = [];
    this.disconnect();
}

Connection.prototype.disconnect = function() {
    if (this.disconnected) return;
    plugins.run_hooks('disconnect', this);
};

Connection.prototype.disconnect_respond = function () {
    this.disconnected = true;
    this.logdebug("closing client");
    this.client.end();
};

Connection.prototype.get_capabilities = function() {
    var capabilities = []
    
    return capabilities;
};

Connection.prototype.tran_uuid = function () {
    this.tran_count++;
    return this.uuid + '.' + this.tran_count;
}

Connection.prototype.reset_transaction = function() {
    delete this.transaction;
};

Connection.prototype.init_transaction = function() {
    this.transaction = trans.createTransaction(this.tran_uuid());
}

Connection.prototype.loop_respond = function (code, msg) {
    this.state = STATE_LOOP;
    this.loop_code = code;
    this.loop_msg = msg;
    this.respond(code, msg);
}

/////////////////////////////////////////////////////////////////////////////
// SMTP Responses

Connection.prototype.lookup_rdns_respond = function (retval, msg) {
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
                this.respond(554, msg || "rDNS Lookup Failed");
                this.disconnect();
                break;
        case constants.denysoft:
                this.loop_respond(421, msg || "rDNS Temporary Failure");
                break;
        case constants.denysoftdisconnect:
                this.respond(421, msg || "rDNS Temporary Failure");
                this.disconnect();
                break;
        default:
                var self = this;
                dns.reverse(this.remote_ip, function(err, domains) {
                    self.rdns_response(err, domains);
                })
    }
}

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
}

Connection.prototype.unrecognized_command_respond = function(retval, msg) {
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
                this.respond(521, msg || "Unrecognized command");
                this.disconnect();
                break;
        default:
                this.respond(500, msg || "Unrecognized command");
    }
};

Connection.prototype.connect_respond = function(retval, msg) {
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
                this.respond(554, msg || "Your mail is not welcome here");
                this.disconnect();
                break;
        case constants.denysoft:
                this.loop_respond(421, msg || "Come back later");
                break;
        case constants.denysoftdisconnect:
                this.respond(421, msg || "Come back later");
                this.disconnect();
                break;
        default:
                var greeting = config.get('smtpgreeting', 'list');
                if (greeting.length) {
                    if (!(/(^|\W)ESMTP(\W|$)/.test(greeting[0]))) {
                        greeting[0] += " ESMTP";
                    }
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
    switch (retval) {
        case constants.deny:
                this.respond(550, msg || "HELO denied");
                this.greeting = null;
                this.hello_host = null;
                break;
        case constants.denydisconnect:
                this.respond(550, msg || "HELO denied");
                this.disconnect();
                break;
        case constants.denysoft:
                this.respond(450, msg || "HELO denied");
                this.greeting = null;
                this.hello_host = null;
                break;
        case constants.denysoftdisconnect:
                this.respond(450, msg || "HELO denied");
                this.disconnect();
                break;
        default:
                this.respond(250, "Haraka says hi " + 
                    ((this.remote_host && this.remote_host !== 'DNSERROR' 
                    && this.remote_host !== 'NXDOMAIN') ? this.remote_host + ' ' : '') 
                    + "[" + this.remote_ip + "]");
    }
};

Connection.prototype.ehlo_respond = function(retval, msg) {
    switch (retval) {
        case constants.deny:
                this.respond(550, msg || "EHLO denied");
                this.greeting = null;
                this.hello_host = null;
                break;
        case constants.denydisconnect:
                this.respond(550, msg || "EHLO denied");
                this.disconnect();
                break;
        case constants.denysoft:
                this.respond(450, msg || "EHLO denied");
                this.greeting = null;
                this.hello_host = null;
                break;
        case constants.denysoftdisconnect:
                this.respond(450, msg || "EHLO denied");
                this.disconnect();
                break;
        default:
                var response = ["Haraka says hi " + 
                                ((this.remote_host && this.remote_host !== 'DNSERROR' && 
                                this.remote_host !== 'NXDOMAIN') ? this.remote_host + ' ' : '')
                                + "[" + this.remote_ip + "]",
                                "PIPELINING",
                                "8BITMIME",
                                ];
                
                var databytes = config.get('databytes');
                response.push("SIZE " + databytes || 0);
                
                this.capabilities = response;
                
                plugins.run_hooks('capabilities', this);
                this.esmtp = true;
    }
};

Connection.prototype.capabilities_respond = function (retval, msg) {
    this.respond(250, this.capabilities);
};

Connection.prototype.quit_respond = function(retval, msg) {
    this.respond(221, msg || "closing connection. Have a jolly good day.");
    this.disconnect();
};

Connection.prototype.vrfy_respond = function(retval, msg) {
    switch (retval) {
        case constants.deny:
                this.respond(550, msg || "Access Denied");
                this.reset_transaction();
                break;
        case constants.denydisconnect:
                this.respond(550, msg || "Access Denied");
                this.disconnect();
                break;
        case constants.denysoft:
                this.respond(450, msg || "Lookup Failed");
                this.reset_transaction();
                break;
        case constants.denysoftdisconnect:
                this.respond(450, msg || "Lookup Failed");
                this.disconnect();
                break;
        case constants.ok:
                this.respond(250, msg || "User OK");
                break;
        default:
                this.respond(252, "Just try sending a mail and we'll see how it turns out...");
    }
};

Connection.prototype.noop_respond = function(retval, msg) {
    switch (retval) {
        case constants.deny:
                this.respond(500, msg || "Stop wasting my time");
                break;
        case constants.denydisconnect:
                this.respond(500, msg || "Stop wasting my time");
                this.disconnect();
                break;
        default:
                this.respond(250, "OK");
    }
};

Connection.prototype.rset_respond = function(retval, msg) {
    // We ignore any plugin responses
    this.reset_transaction();    
    this.respond(250, "OK");
}

Connection.prototype.mail_respond = function(retval, msg) {
    var sender = this.transaction.mail_from;
    var dmsg   = "sender " + sender.format();
    switch (retval) {
        case constants.deny:
                this.respond(550, msg || dmsg + " denied");
                this.reset_transaction();
                break;
        case constants.denydisconnect:
                this.respond(550, msg || dmsg + " denied");
                this.disconnect();
                break;
        case constants.denysoft:
                this.respond(450, msg || dmsg + " denied");
                this.reset_transaction();
                break;
        case constants.denysoftdisconnect:
                this.respond(450, msg || dmsg + " denied");
                this.disconnect();
                break;
        default:
                this.respond(250, msg || dmsg + " OK");
    }
};

Connection.prototype.rcpt_ok_respond = function (retval, msg) {
    var rcpt = this.transaction.rcpt_to[this.transaction.rcpt_to.length - 1];
    var dmsg = "recipient " + rcpt.format();
    switch (retval) {
        case constants.deny:
                this.respond(550, msg || dmsg + " denied");
                this.transaction.rcpt_to.pop();
                break;
        case constants.denydisconnect:
                this.respond(550, msg || dmsg + " denied");
                this.disconnect();
                break;
        case constants.denysoft:
                this.respond(450, msg || dmsg + " denied");
                this.transaction.rcpt_to.pop();
                break;
        case constants.denysoftdisconnect:
                this.respond(450, msg || dmsg + " denied");
                this.disconnect();
                break;
        default:
                this.respond(250, msg || dmsg + " OK");
    }
}

Connection.prototype.rcpt_respond = function(retval, msg) {
    if (retval === constants.cont && this.relaying) {
        retval = constants.ok;
    }

    var rcpt = this.transaction.rcpt_to[this.transaction.rcpt_to.length - 1];
    var dmsg = "recipient " + rcpt.format();
    switch (retval) {
        case constants.deny:
                this.respond(550, msg || dmsg + " denied");
                this.transaction.rcpt_to.pop();
                break;
        case constants.denydisconnect:
                this.respond(550, msg || dmsg + " denied");
                this.disconnect();
                break;
        case constants.denysoft:
                this.respond(450, msg || dmsg + " denied");
                this.transaction.rcpt_to.pop();
                break;
        case constants.denysoftdisconnect:
                this.respond(450, msg || dmsg + " denied");
                this.disconnect();
                break;
        case constants.ok:
                plugins.run_hooks('rcpt_ok', this, rcpt);
                break;
        default:
                if (retval !== constants.cont) {
                    this.logalert("No plugin determined if relaying was allowed");
                }
                this.transaction.rcpt_to.pop();
                this.respond(450, "I cannot deliver mail for " + rcpt.format());
    }
};

/////////////////////////////////////////////////////////////////////////////
// SMTP Commands

Connection.prototype.cmd_helo = function(line) {
    var results = (new String(line)).split(/ +/);
    var host = results[0];
    if (!host) {
        return this.respond(501, "HELO requires domain/address - see RFC-2821 4.1.1.1");
    }
    
    if (this.hello_host) {
        return this.respond(503, "You already said HELO");
    }
    
    this.greeting   = 'HELO';
    this.hello_host = host;

    plugins.run_hooks('helo', this, host);
};

Connection.prototype.cmd_ehlo = function(line) {
    var results = (new String(line)).split(/ +/);
    var host = results[0];
    if (!host) {
        return this.respond(501, "EHLO requires domain/address - see RFC-2821 4.1.1.1");
    }
    
    if (this.hello_host) {
        return this.respond(503, "You already said EHLO");
    }
    
    this.greeting   = 'EHLO';
    this.hello_host = host;

    plugins.run_hooks('ehlo', this, host);
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
    var results;
    var from;
    try {
        results = rfc1869.parse("mail", line);
        from    = new Address (results.shift());
    }
    catch (err) {
        if (err.stack) {
            this.logerror(err.stack.split(/\n/)[0]);
        }
        else {
            this.logerror(err);
        }
        return this.respond(501, "Command parsing failed");
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
    if (params && params['SIZE'] && params['SIZE'] > 0) {
        var databytes = config.get('databytes');
        if (databytes && databytes > 0 && params['SIZE'] > databytes) {
            return this.respond(550, 'Message too big!');
        }
    } 
    
    this.init_transaction();
    this.transaction.mail_from = from
    this.loginfo('MAIL FROM: ' + from);
    plugins.run_hooks('mail', this, [from, params]);
};

Connection.prototype.cmd_rcpt = function(line) {
    if (!this.transaction || !this.transaction.mail_from) {
        return this.respond(503, "Use MAIL before RCPT");
    }
    
    var results;
    var recip;
    try {
        results = rfc1869.parse("rcpt", line);
        recip   = new Address(results.shift());
    }
    catch (err) {
        if (err.stack) {
            this.logerror(err.stack.split(/\n/)[0]);
        }
        else {
            this.logerror(err);
        }
        return this.respond(501, "Command parsing failed");
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
    this.loginfo('RCPT TO: ' + recip);
    plugins.run_hooks('rcpt', this, [recip, params]);
};

Connection.prototype.received_line = function() {
    var smtp = this.greeting === 'EHLO' ? 'ESMTP' : 'SMTP';
    // Implement RFC3848
    if (this.using_tls)  smtp = smtp + 'S';
    if (this.authheader) smtp = smtp + 'A';
    // TODO - populate authheader and sslheader - see qpsmtpd for how to.
    // sslheader is not possible with TLS support in node yet.
    return [
        'from ',
            // If no rDNS then use an IP literal here
            ((!/^(?:DNSERROR|NXDOMAIN)/.test(this.remote_info)) 
                ? this.remote_info : '[' + this.remote_ip + ']'),
            ' (', this.hello_host, ' [', this.remote_ip, ']) ', 
        "\n\t", 
            'by ', config.get('me'), ' (Haraka/', version, ') with ', smtp, 
            ' id ', this.transaction.uuid, 
        "\n\t",
            '(envelope-from ', this.transaction.mail_from.format(), ')',
            // ((this.sslheader) ? ' ' + this.sslheader.replace(/\r?\n\t?$/,'') : ''), 
            ((this.authheader) ? ' ' + this.authheader.replace(/\r?\n\t?$/, '') : ''),
        ";\n\t", date_to_str(new Date())
    ].join('');
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
    plugins.run_hooks('data', this);
};

Connection.prototype.data_respond = function(retval, msg) {
    var cont = 0;
    switch (retval) {
        case constants.deny:
                this.respond(554, msg || "Message denied");
                this.reset_transaction();
                break;
        case constants.denydisconnect:
                this.respond(554, msg || "Message denied");
                this.disconnect();
                break;
        case constants.denysoft:
                this.respond(451, msg || "Message denied");
                this.reset_transaction();
                break;
        case constants.denysoftdisconnect:
                this.respond(451, msg || "Message denied");
                this.disconnect();
                break;
        default:
                cont = 1;
    }
    
    if (!cont) {
        return;
    }

    // We already checked for MAIL/RCPT in cmd_data
    this.respond(354, "go ahead, make my day");
    // OK... now we get the data
    this.state = STATE_DATA;
    this.transaction.data_bytes = 0;
    this.max_bytes = config.get('databytes');
};

Connection.prototype.accumulate_data = function(line) {
    if (line === ".\r\n")
        return this.data_done();

    // Bare LF checks
    if (line === ".\r" || line === ".\n") {
        this.logerror("Client sent bare line-feed - .\\r or .\\n rather than .\\r\\n");
        this.respond(451, "See http://haraka.github.com/barelf.html");
        this.reset_transaction();
        return;
    }

    // Stop accumulating data as we're going to reject at dot.
    if (this.max_bytes && this.transaction.data_bytes > this.max_bytes) { 
        return;
    }

    this.transaction.add_data(line.replace(/^\.\./, '.').replace(/\r\n$/, "\n"));
};

Connection.prototype.data_done = function() {
    this.state = STATE_PAUSE;

    // Check message size limit
    if (this.max_bytes && this.transaction.data_bytes > this.max_bytes) {
        this.logerror("Incoming message exceeded databytes size of " + this.max_bytes);
        this.respond(550, "Message too big!");
        this.reset_transaction();
        return;
    }

    this.transaction.end_data();

    plugins.run_hooks('data_post', this);
};

Connection.prototype.data_post_respond = function(retval, msg) {
    switch (retval) {
        case constants.deny:
                this.respond(552, msg || "Message denied");
                this.reset_transaction();
                break;
        case constants.deny_disconnect:
                this.respond(552, msg || "Message denied");
                this.disconnect();
                break;
        case constants.denysoft:
                this.respond(452, msg || "Message denied temporarily");
                this.reset_transaction();
                break;
        case constants.denysoftdisconnect:
                this.respond(452, msg || "Message denied temporarily");
                this.disconnect();
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

Connection.prototype.queue_outbound_respond = function(retval, msg) {
    switch(retval) {
        case constants.ok:
                this.respond(250, msg || "Message Queued");
                plugins.run_hooks("queue_ok", this);
                break;
        case constants.deny:
                this.respond(552, msg || "Message denied");
                this.reset_transaction();
                break;
        case constants.denydisconnect:
                this.respond(552, msg || "Message denied");
                this.disconnect();
                break;
        case constants.denysoft:
                this.respond(452, msg || "Message denied temporarily");
                this.reset_transaction();
                break;
        case constants.denysoftdisconnect:
                this.respond(452, msg || "Message denied temporarily");
                this.disconnect();
                break;
        default:
                var conn = this;
                outbound.send_email(this.transaction, function(retval, msg) {
                    switch(retval) {
                        case constants.ok:
                                conn.respond(250, msg || "Message Queued");
                                plugins.run_hooks("queue_ok", conn);
                                break;
                        case constants.deny:
                                conn.respond(552, msg || "Message denied");
                                conn.reset_transaction();
                                break;
                        default:
                                conn.logerror("Unrecognised response from outbound layer: " + retval + " : " + msg);
                                conn.respond(552, msg || "Internal Server Error");
                                conn.reset_transaction();
                    }
                });
    }
}

Connection.prototype.queue_respond = function(retval, msg) {
    switch (retval) {
        case constants.ok:
                this.respond(250, msg || "Message Queued");
                plugins.run_hooks("queue_ok", this);
                break;
        case constants.deny:
                this.respond(552, msg || "Message denied");
                this.reset_transaction();
                break;
        case constants.denydisconnect:
                this.respond(552, msg || "Message denied");
                this.disconnect();
                break;
        case constants.denysoft:
                this.respond(452, msg || "Message denied temporarily");
                this.reset_transaction();
                break;
        case constants.denysoftdisconnect:
                this.respond(452, msg || "Message denied temporarily");
                this.disconnect();
                break;
        default:
                this.respond(451, msg || "Queuing declined or disabled, try later");
                this.reset_transaction();
                break;
    }
};

Connection.prototype.queue_ok_respond = function (retval, msg) {
    this.reset_transaction();
};
