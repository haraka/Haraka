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

var version  = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'))).version;

var line_regexp = /^([^\n]*\n)/;

var connection = exports;

// copy logger methods into Connection:
for (var key in logger) {
    if (key.match(/^log\w/)) {
        Connection.prototype[key] = (function (key) {
            return function () {
                var args = [ (this.transaction ? this.transaction.uuid : this.uuid) + " " ];
                var start = 0;
                if (arguments.length && arguments[0] instanceof plugins.Plugin) {
                    start = 1;
                    args.unshift("[" + arguments[0].name + "]");
                }
                for (var i=start, l=arguments.length; i<l; i++) {
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
    
    self.client.on('error', function (err) {
        if (!self.disconnected) {
            self.fail("client closed with err: " + err);
        }
    });
    
    self.client.on('timeout', function () {
        if (!self.disconnected) {
            self.fail("client (" + self.client.fd + ") timed out");
        }
    });
    
    self.client.on('data', function (data) {
        self.process_data(data);
    });
    
    plugins.run_hooks('lookup_rdns', self);
}

function Connection(client) {
    this.client = client;
    this.current_data = '';
    this.current_line = null;
    this.state = 'pause';
    this.uuid = uuid();
    this.notes = {};
    this.tran_count = 0;
    this.early_talker_delay = config.get('early_talker_delay', 'nolog') || 1000;
    this.deny_includes_uuid = config.get('deny_includes_uuid', 'nolog') ? true : false;
    this.relaying = false;
    this.disconnected = false;
    this.hooks_to_run = [];
    
    setupClient(this);
}

exports.Connection = Connection;

exports.createConnection = function(client) {
    var s = new Connection(client);
    return s;
}

Connection.prototype.process_line = function (line) {
    if (this.state === 'cmd') {
        this.logprotocol("C: " + line);
        this.state = 'pause';
        this.current_line = line.replace(/\r?\n$/, '');
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
    else if (this.state === 'data') {
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
        if (this.state === 'pause') {
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

Connection.prototype.respond = function(code, messages) {
    if (this.disconnected) {
        return;
    }
    if (!(typeof messages === 'object' && messages.constructor === Array)) {
        // messages not an array, make it so:
        messages = [ '' + messages ];
    }

    if (code >= 400 && this.deny_includes_uuid) {
        messages.push("for support please provide uuid:" + (this.transaction || this).uuid);
    }
    
    var msg;
    var buf = '';
    while (msg = messages.shift()) {
        var line = code + (messages.length ? "-" : " ") + msg;
        this.logprotocol("S: " + line);
        buf = buf + line + "\r\n";
    }
    
    try {
        this.client.write(buf);
    }
    catch (err) {
        return this.fail("Writing response: " + buf + " failed: " + err);
    }
    
    this.state = 'cmd';
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
    if (this.client.fd) {
        this.client.end();
    }
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

/////////////////////////////////////////////////////////////////////////////
// SMTP Responses

Connection.prototype.lookup_rdns_respond = function (retval, msg) {
    switch(retval) {
        case constants.ok:
                this.remote_host = msg || 'Unknown';
                plugins.run_hooks('connect', this);
                break;
        case constants.deny:
        case constants.denydisconnect:
        case constants.disconnect:
                this.respond(500, msg || "rDNS Lookup Failed");
                this.disconnect();
                break;
        case constants.denysoft:
                this.respond(450, msg || "rDNS Temporary Failure");
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
                             var greeting = config.get('smtpgreeting', 'nolog', 'list');
                             if (greeting.length) {
                                 if (!(/(^|\W)ESMTP(\W|$)/.test(greeting[0]))) {
                                     greeting[0] += " ESMTP";
                                 }
                             }
                             else {
                                 greeting = (config.get('me', 'nolog') + 
                                            " ESMTP Haraka " + version + " ready");
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
                this.disconnect();
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
                
                var databytes = config.get('databytes', 'nolog');
                if (databytes) {
                    response.push("SIZE " + databytes);
                }
                
                this.capabilities = response;
                
                plugins.run_hooks('capabilities', this);
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

Connection.prototype.rcpt_ok_respond = function (retval, msg) {
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
        default:
                this.respond(250, msg || "recipient ok");
    }
}

Connection.prototype.rcpt_respond = function(retval, msg) {
    
    if (retval === constants.cont && this.relaying) {
        retval = constants.ok;
    }
        
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
                plugins.run_hooks('rcpt_ok', this, this.transaction.rcpt_to[this.transaction.rcpt_to.length - 1]);
                break;
        default:
                if (retval !== constants.cont)
                    this.logalert("No plugin determined if relaying was allowed");
                this.respond(450, "I cannot deliver for that user");
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
    
    this.init_transaction();
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
    
    this.transaction.rcpt_to.push(recip);
    
    // Get rest of key=value pairs
    var params = {};
    results.forEach(function(param) {
        var kv = param.match(/^(.*?)=(.*)$/);
        if (kv)
            params[kv[0]] = kv[1];
    });
    
    plugins.run_hooks('rcpt', this, [recip, params]);
};

var _daynames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
var _monnames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function _pad(num, n, p) {
        var s = '' + num;
        p = p || '0';
        while (s.length < n) s = p + s;
        return s;
}

function _date_to_str(d) {
    return _daynames[d.getDay()] + ', ' + _pad(d.getDate(),2) + ' ' +
           _monnames[d.getMonth()] + ' ' + d.getFullYear() + ' ' +
           _pad(d.getHours(),2) + ':' + _pad(d.getMinutes(),2) + ':' + _pad(d.getSeconds(),2) +
           ' ' + d.toString().match(/\sGMT([+-]\d+)/)[1];
}

Connection.prototype.received_line = function() {
    var smtp = this.greeting === 'EHLO' ? 'ESMTP' : 'SMTP';
    // TODO - populate authheader and sslheader - see qpsmtpd for how to.
    return  "from " + this.remote_info
           +" (HELO " + this.hello_host + ") ("+this.remote_ip
           +")\n  " + (this.authheader || '') + "  by " + config.get('me', 'nolog')
           +" (Haraka/" + version
           +") with " + (this.sslheader || '') + smtp + "; "
           + _date_to_str(new Date());
};

Connection.prototype.cmd_data = function(line) {
    if (!this.transaction) {
        return this.respond(503, "MAIL required first");
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
        this.transaction.data_bytes = 0;
        this.max_bytes = config.get('databytes', 'nolog');
    }
};

Connection.prototype.accumulate_data = function(line) {
    if (line === ".\r\n")
        return this.data_done();
    
    if (this.max_bytes && this.transaction.data_bytes > this.max_bytes) {
        this.logerror("Incoming message exceeded databytes size of " + this.max_bytes);
        this.respond(552, "Message too big!");
        this.disconnect(); // a bit rude, but otherwise people will just keep spewing
        return;
    }
    
    // Bare LF checks
    if (line === ".\r" || line === ".\n") {
        // I really should create my own URL...
        this.logerror("Client sent bare line-feed - .\\r or .\\n rather than .\\r\\n");
        this.respond(421, "See http://smtpd.develooper.com/barelf.html");
        this.disconnect();
        return;
    }
    
    this.transaction.add_data(line.replace(/\r\n$/, "\n"));
};

Connection.prototype.data_done = function() {
    this.state = 'pause';
    // this.transaction.add_header('X-Haraka', 'Version ' + version);
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
        default:
                var conn = this;
                outbound.send_email(this.transaction, function(retval, msg) {
                    switch(retval) {
                        case constants.ok:
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
        default:
                this.respond(451, msg || "Queuing declined or disabled, try later");
                this.reset_transaction();
                break;
    }
};

Connection.prototype.queue_ok_respond = function (retval, msg) {
    this.reset_transaction();
    this.respond(250, msg || "Message Queued");
};
