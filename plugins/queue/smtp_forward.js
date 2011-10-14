// Forward to an SMTP server

var os   = require('os');
var sock = require('./line_socket');

exports.register = function () {
    this.register_hook('queue', 'smtp_forward');
};

var smtp_regexp = /^([0-9]{3})([ -])(.*)/;

exports.smtp_forward = function (next, connection) {
    this.loginfo("smtp forwarding");
    var smtp_config = this.config.get('smtp_forward.ini');
    var socket = sock.connect(smtp_config.main.port, smtp_config.main.host);
    socket.setTimeout(300 * 1000);
    var self = this;
    var command = 'connect';
    var response = [];
    // copy the recipients:
    var recipients = connection.transaction.rcpt_to.map(function(item) { return item });
    var data_marker = 0;
    
    var send_data = function () {
        if (data_marker < connection.transaction.data_lines.length) {
            var wrote_all = socket.write(connection.transaction.data_lines[data_marker].replace(/^\./, '..').replace(/\r?\n/g, '\r\n'));
            data_marker++;
            if (wrote_all) {
                send_data();
            }
        }
        else {
            socket.send_command('dot');
        }
    }
    
    socket.send_command = function (cmd, data) {
        var line = cmd + (data ? (' ' + data) : '');
        if (cmd === 'dot') {
            line = '.';
        }
        self.logprotocol("Fwd C: " + line);
        // Set this before we write() in case 'drain' is called
        // to stop send_data() form calling 'dot' twice.
        command = cmd.toLowerCase();
        this.write(line + "\r\n");
        // Clear response buffer from previous command
        response = [];
    };
    
    socket.on('timeout', function () {
        self.logerror("Ongoing connection timed out");
        socket.end();
        next();
    });
    socket.on('error', function (err) {
        self.logerror("Ongoing connection failed: " + err);
        // we don't deny on error - maybe another plugin can deliver
        next(); 
    });
    socket.on('connect', function () {
    });
    socket.on('line', function (line) {
        var matches;
        self.logprotocol("Fwd S: " + line);
        if (matches = smtp_regexp.exec(line)) {
            var code = matches[1],
                cont = matches[2],
                rest = matches[3];
            response.push(rest);
            if (cont === ' ') {
                self.logdebug('command state: ' + command);
                // Handle fallback to HELO if EHLO is rejected
                if (command === 'ehlo') {
                    if (code.match(/^5/)) {
                        // Handle fallback to HELO if EHLO is rejected
                        if (!this.xclient) {
                            socket.send_command('HELO', self.config.get('me'));
                        }
                        else {
                            socket.send_command('HELO', connection.hello_host);
                        }
                        return;
                    }
                    // Parse CAPABILITIES
                    for (i in response) {
                        if (response[i].match(/^XCLIENT/)) {
                            if(!this.xclient) {
                                // Just use the ADDR= key for now
                                socket.send_command('XCLIENT', 'ADDR=' + connection.remote_ip);
                                return;
                            }
                        }
                        if (response[i].match(/^STARTTLS/)) {
                            var key = self.config.get('tls_key.pem', 'data').join("\n");
                            var cert = self.config.get('tls_cert.pem', 'data').join("\n");
                            // Use TLS opportunistically if we found the key and certificate
                            if (key && cert && (!/(true|1)/i.exec(smtp_config.main.disable_tls))) {
                                this.on('secure', function () {
                                    socket.send_command('EHLO', self.config.get('me'));
                                });
                                socket.send_command('STARTTLS');
                                return;
                            }
                        }
                    }
                }
                if (command === 'xclient' && code.match(/^5/)) {
                    // XCLIENT command was rejected (no permission?)
                    // Carry on without XCLIENT
                    command = 'helo';
                } 
                else if (!(command === 'mail' || command === 'rcpt') && code.match(/^[45]/)) {
                    // NOTE: recipients can be sent at both 'mail' *AND* 'rcpt'
                    // command states if multiple recipients are present.
                    // We ignore errors for both states as the DATA command will
                    // be rejected by the remote end if there are no recipients.
                    socket.send_command('QUIT');
                    return next(); // Fall through to other queue hooks here
                }
                switch (command) {
                    case 'xclient':
                        // If we are in XCLIENT mode, proxy the HELO/EHLO from the client
                        this.xclient = true;
                        socket.send_command('EHLO', connection.hello_host);
                        break;
                    case 'starttls':
                        var tls_options = { key: key, cert: cert };
                        this.upgrade(tls_options);
                        break;
                    case 'connect':
                        socket.send_command('EHLO', self.config.get('me'));
                        break;
                    case 'ehlo':
                    case 'helo':
                        socket.send_command('MAIL', 'FROM:' + connection.transaction.mail_from);
                        break;
                    case 'mail':
                        socket.send_command('RCPT', 'TO:' + recipients.shift());
                        if (recipients.length) {
                            // don't move to next state if we have more recipients
                            command = 'mail';
                            return;
                        }
                        break;
                    case 'rcpt':
                        socket.send_command('DATA');
                        break;
                    case 'data':
                        send_data();
                        break;
                    case 'dot':
                        socket.send_command('QUIT');
                        next(OK);
                        break;
                    case 'quit':
                        socket.end();
                        break;
                    default:
                        throw new Error("Unknown command: " + command);
                }
            }
        }
        else {
            // Unrecognised response.
            self.logerror("Unrecognised response from upstream server: " + line);
            socket.end();
            return next();
        }
    });
    socket.on('drain', function() {
        self.logdebug("Drained");
        if (command === 'data') {
            send_data();
        }
    });
};

