// Forward to an SMTP server
var sock = require('./line_socket');

exports.register = function () {
    this.inherits('queue/conn_pool_base');
    this.register_hook('queue', 'smtp_forward');
};

var smtp_regexp = /^([0-9]{3})([ -])(.*)/;

exports.smtp_forward = function (next, connection) {
    var smtp_config = this.config.get('smtp_forward.ini');
    connection.loginfo(this, "forwarding to " + smtp_config.main.host + ":" + smtp_config.main.port);
    var smtp_forward = this.conn_get(connection, smtp_config.main.host, smtp_config.main.port, 300 * 1000);
    var socket = smtp_forward.socket;
    var command = 'connect';
    var self = this;
    var response = [];
    // copy the recipients:
    var recipients = connection.transaction.rcpt_to.map(function(item) { return item });
    var data_marker = 0;
    var dot_pending = true;

    var send_data = function () {
        var wrote_all = true;
        while (wrote_all && (data_marker < connection.transaction.data_lines.length)) {
            var line = connection.transaction.data_lines[data_marker];
            data_marker++;
            wrote_all = socket.write(line.replace(/^\./, '..').replace(/\r?\n/g, '\r\n'));
            if (!wrote_all) return;
        }
        // we get here if wrote_all still true, and we got to end of data_lines
        if (dot_pending) {
            dot_pending = false;
            socket.send_command('dot');
        }
    };

    socket.on('drain', function () {
        connection.logdebug(self, 'drain');
        if (dot_pending && command === 'databody') {
            process.nextTick(function () { send_data() });
        }
    });

    socket.send_command = function (cmd, data) {
        var line = cmd + (data ? (' ' + data) : '');
        if (cmd === 'dot') {
            line = '.';
        }
        connection.logprotocol(self, "C: " + line);
        command = cmd.toLowerCase();
        socket.write(line + "\r\n");
        // Clear response buffer from previous command
        response = [];
    };
    
    socket.on('timeout', function () {
        connection.logerror(self, "Ongoing connection timed out");
        next();
    });
    socket.on('error', function (err) {
        connection.logerror(self, "Ongoing connection failed: " + err);
        // we don't deny on error - maybe another plugin can deliver
        next(); 
    });
    socket.on('connect', function () {
    });
    socket.on('line', function (line) {
        var matches;
        connection.logprotocol(self, "S: " + line);
        if (matches = smtp_regexp.exec(line)) {
            var code = matches[1],
                cont = matches[2],
                rest = matches[3];
            response.push(rest);
            if (cont === ' ') {
                connection.logdebug(self, 'command state: ' + command);
                // Handle fallback to HELO if EHLO is rejected
                if (command === 'ehlo') {
                    if (code.match(/^5/)) {
                        // Handle fallback to HELO if EHLO is rejected
                        if (!socket.xclient) {
                            socket.send_command('HELO', self.config.get('me'));
                        }
                        else {
                            socket.send_command('HELO', connection.hello_host);
                        }
                        return;
                    }
                    // Parse CAPABILITIES
                    for (var i in response) {
                        if (response[i].match(/^XCLIENT/)) {
                            if(!socket.xclient) {
                                // Just use the ADDR= key for now
                                socket.send_command('XCLIENT', 'ADDR=' + connection.remote_ip);
                                return;
                            }
                        }
                        if (response[i].match(/^STARTTLS/)) {
                            var key = self.config.get('tls_key.pem', 'data').join("\n");
                            var cert = self.config.get('tls_cert.pem', 'data').join("\n");
                            // Use TLS opportunistically if we found the key and certificate
                            if (key && cert && (!/(true|yes|1)/i.exec(smtp_config.main.enable_tls))) {
                                socket.on('secure', function () {
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
                    socket.send_command('RSET');
                    return next(); // Fall through to other queue hooks here
                }
                switch (command) {
                    case 'xclient':
                        // If we are in XCLIENT mode, proxy the HELO/EHLO from the client
                        socket.xclient = true;
                        socket.send_command('EHLO', connection.hello_host);
                        break;
                    case 'starttls':
                        var tls_options = { key: key, cert: cert };
                        socket.upgrade(tls_options);
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
                        command = 'databody';
                        send_data();
                        break;
                    case 'dot':
                        // Return the response from the forwarder back to the client
                        // But add in our transaction UUID at the end of the line.
                        next(OK, response + ' (' + connection.transaction.uuid + ')');
                        socket.send_command('RSET');
                        break;
                    case 'rset':
                        self.conn_idle(connection);
                        break;
                    default:
                        throw new Error("Unknown command: " + command);
                }
            }
        }
        else {
            // Unrecognised response.
            connection.logerror(self, "Unrecognised response from upstream server: " + line);
            socket.end();
            return next();
        }
    });

    if (smtp_forward.pool_connection) {
        // If we used XCLIENT earlier; we *must* re-send it again
        // To update the proxy with the new client details.
        if (socket.xclient) {
            socket.send_command('XCLIENT', 'ADDR=' + connection.remote_ip);
        }
        else {
            socket.send_command('MAIL', 'FROM:' + connection.transaction.mail_from);
        }
    }
};
