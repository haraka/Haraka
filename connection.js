// a single connection
var config  = require('./config');
var logger  = require('./logger');
var trans   = require('./transaction');
var dns     = require('dns');
var plugins = require('./plugins');
var constants = require('./constants');
var rfc1869   = require('./rfc1869');

var line_regexp = /^([^\n]*\n)/;

var connection = exports;

function setupClient(self) {
    self.client.pause();
    self.remote_ip = self.client.remoteAddress;
    logger.log("connection from: " + self.remote_ip);
    dns.reverse(self.remote_ip, function(err, domains) {
        if (err) {
            switch (err.code) {
                case dns.NXDOMAIN: self.remote_host = 'NXDOMAIN'; break;
                default:           self.remote_host = 'DNSERROR'; break;
            }
        }
        else {
            self.remote_host = domains[0] || 'Unknown';
        }
        self.client.on('data', function (data) {
            self.process_data(data);
        });
        self.client.resume();
        self.transaction = trans.createTransaction();
        // TODO - check for early talkers before this
        plugins.run_hooks('connect', self);
    });
}

function Connection(client) {
    this.client = client;
    this.current_data = '';
    this.current_line = null;
    this.state = 'cmd'; // command or data
    
    setupClient(this);
}

exports.Connection = Connection;

exports.createConnection = function(client) {
    var s = new Connection(client);
    return s;
}

Connection.prototype.process_line = function (line) {
    logger.log("C: " + line);
    if (this.state === 'cmd') {
        this.current_line = line.replace(/\r?\n$/, '');
        var matches = /^([^ ]*)( +(.*))?$/.exec(this.current_line);
        var method = "cmd_" + matches[1].toLowerCase();
        var remaining = matches[3] || '';
        if (this[method]) {
            try {
                this[method](remaining);
            }
            catch (err) {
                logger.log(method + " failed: " + err);
                this.respond(500, "Internal Server Error");
                this.disconnect;
            }
        }
        else {
            // unrecognised command
            plugins.run_hooks('unrecognized_command', this);
        }
    }
    else if (this.state === 'data') {
        this.accumulate_data(line);
    }
};

Connection.prototype.process_data = function (data) {
    if (this.disconnected) {
        logger.log("data after disconnect");
        return;
    }
    
    this.current_data += data;
    
    var results;
    while (results = line_regexp.exec(this.current_data)) {
        var this_line = results[1];
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

Connection.prototype.respond = function(code, messages) {
    if (!(typeof messages === 'object' && messages.constructor === Array)) {
        // messages not an array, make it so:
        messages = [ '' + messages ];
    }
    var msg;
    var buf = '';
    while (msg = messages.shift()) {
        var line = code + (messages.length ? "-" : " ") + msg;
        buf = buf + line + "\r\n";
    }
    
    this.client.write(buf);
};

Connection.prototype.disconnect = function() {
    plugins.run_hooks('disconnect', this);
};

Connection.prototype.disconnect_respond = function () {
    this.disconnected = 1;
    this.client.end();
};

Connection.prototype.get_capabilities = function() {
    var capabilities = []
    
    // TODO get AUTH mechanisms here
    // TODO get STARTTLS here if loaded?
    
    return capabilities;
};

Connection.prototype.reset_transaction = function() {
    this.transaction = trans.createTransaction();
};

/////////////////////////////////////////////////////////////////////////////
// SMTP Responses

Connection.prototype.unrecognized_command_respond = function(retval, msg) {
    switch(retval) {
        case constants.deny:        this.respond(500, msg || "Unrecognized command");
                                    break;
        case constants.denydisconnect:
                                    this.respond(521, msg || "Unrecognized command");
                                    this.disconnect;
                                    break;
        default:                    this.respond(500, msg || "Unrecognized command");
    }
};

Connection.prototype.connect_respond = function(retval, msg) {
    switch (retval) {
        case constants.deny:
        case constants.denydisconnect:
        case constants.disconnect:
                             this.respond(550, msg || "Your mail is not welcome here");
                             this.disconnect();
                             break;
        case constants.denysoft:
                             this.respond(450, msg || "Come back later");
                             break;
        default:
                             this.respond(220, msg || "myhost ESMTP Haraka VER ready");
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
                this.disconnect;
                break;
        case constants.denysoft:
                this.respond(450, msg || "HELO denied");
                this.greeting = null;
                this.hello_host = null;
                break;
        default:
                this.respond(250, "Haraka says hi " + this.remote_host + " [" + this.remote_ip + "]");
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
                this.disconnect;
                break;
        case constants.denysoft:
                this.respond(450, msg || "EHLO denied");
                this.greeting = null;
                this.hello_host = null;
                break;
        default:
                var response = ["Haraka says hi " + this.remote_host + " [" + this.remote_ip + "]",
                                "PIPELINING",
                                "8BITMIME"
                                ];
                
                var databytes = config.get('databytes');
                if (databytes) {
                    response.push("SIZE " + databytes[0]);
                }
                
                var capabilities = this.get_capabilities();
                var i;
                for (i = 0; i < capabilities.length; i++) {
                    response.push(capabilities[i]);
                }
                this.respond(250, response);
    }
};

Connection.prototype.quit_respond = function(retval, msg) {
    this.respond(221, msg || "closing connection. Have jolly good day.");
    this.disconnect();
};

Connection.prototype.vrfy_respond = function(retval, msg) {
    switch (retval) {
        case constants.deny:
                this.respond(554, msg || "Access Denied");
                this.reset_transaction();
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

Connection.prototype.mail_respond = function(retval, msg) {
    switch (retval) {
        case constants.deny:
                this.respond(550, msg || "mail from denied");
                this.reset_transaction();
                break;
        case constants.denydisconnect:
                this.respond(550, msg || "mail from denied");
                this.disconnect();
                break;
        case constants.denysoft:
                this.respond(450, msg || "mail from denied");
                this.reset_transaction();
                break;
        default:
                this.respond(250, msg || "sender OK");
    }
};

Connection.prototype.rcpt_respond = function(retval, msg) {
    switch (retval) {
        case constants.deny:
                this.respond(550, msg || "delivery denied");
                this.transaction.rcpt_to.pop();
                break;
        case constants.denydisconnect:
                this.respond(550, msg || "delivery denied");
                this.disconnect();
                break;
        case constants.denysoft:
                this.respond(450, msg || "delivery denied for now");
                this.transaction.rcpt_to.pop();
                break;
        case constants.ok:
                this.respond(250, msg || "recipient ok");
                break;
        default:
                logger.log("No plugin determined if relaying was allowed");
                this.respond(450, "Internal server error");
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

Connection.prototype.cmd_quit = function() {
    plugins.run_hooks('quit', this);
};

Connection.prototype.cmd_rset = function() {
    this.reset_transaction();
    this.respond(250, "OK");
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
    var results;
    try {
        results = rfc1869.parse("mail", line);
    }
    catch (err) {
        return this.respond(501, err);
    }
    
    this.reset_transaction();
    var from = results.shift();
    this.transaction.mail_from = from;
    
    // Get rest of key=value pairs
    var params = {};
    results.forEach(function(param) {
        var kv = param.match(/^(.*?)=(.*)$/);
        if (kv)
            params[kv[0]] = kv[1];
    });
    
    plugins.run_hooks('mail', this, [from, params]);
};

Connection.prototype.cmd_rcpt = function(line) {
    if (!this.transaction.mail_from) {
        return this.respond(503, "Use MAIL before RCPT");
    }
    
    var results;
    try {
        results = rfc1869.parse("rcpt", line);
    }
    catch (err) {
        return this.respond(501, err);
    }
    
    var recipient = results.shift();
    this.transaction.rcpt_to.push(recipient);
    
    // Get rest of key=value pairs
    var params = {};
    results.forEach(function(param) {
        var kv = param.match(/^(.*?)=(.*)$/);
        if (kv)
            params[kv[0]] = kv[1];
    });
    
    plugins.run_hooks('rcpt', this, [recipient, params]);
};

Connection.prototype.cmd_data = function(line) {
    plugins.run_hooks('data', this);
};

Connection.prototype.data_respond = function(retval, msg) {
    var cont = 0;
    switch (retval) {
        case constants.deny:
                this.respond(554, msg || "Message denied");
                this.reset_transaction();
                break;
        case constants.deny_disconnect:
                this.respond(554, msg || "Message denied");
                this.disconnect();
                break;
        case constants.denysoft:
                this.respond(451, msg || "Message denied");
                this.reset_transaction();
                break;
        default:
                cont = 1;
    }
    
    if (!cont) {
        return;
    }
    
    if (!this.transaction.mail_from) {
        this.respond(503, "MAIL required first");
    }
    else if (!this.transaction.rcpt_to.length) {
        this.respond(503, "RCPT required first");
    }
    else {
        this.respond(354, "go ahead, make my day");
        // OK... now we get the data
        this.state = 'data';
    }
};

Connection.prototype.accumulate_data = function(line) {
    if (line === ".\r\n")
        return this.data_done();
    
    // Bare LF checks
    if (line === ".\r" || line === ".\n") {
        // I really should create my own URL...
        this.respond(421, "See http://smtpd.develooper.com/barelf.html");
        this.disconnect();
        return;
    }
    
    // TODO: check size
    
    this.transaction.data_add(line);
};

Connection.prototype.data_done = function() {
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
        default:
                plugins.run_hooks("queue", this);
    }
};

Connection.prototype.queue_respond = function(retval, msg) {
    this.reset_transaction();
    
    switch (retval) {
        case constants.ok:
                this.respond(250, msg || "Message Queued");
                break;
        case constants.deny:
                this.respond(552, msg || "Message denied");
                break;
        case constants.denydisconnect:
                this.respond(552, msg || "Message denied");
                this.disconnect();
                break;
        case constants.denysoft:
                this.respond(452, msg || "Message denied temporarily");
                break;
        default:
                this.respond(451, msg || "Queuing declined or disabled, try later");
                break;
    }
};

