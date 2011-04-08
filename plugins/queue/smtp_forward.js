// Forward to an SMTP server

var os   = require('os');
var sock = require('./line_socket');

exports.register = function () {
    this.register_hook('queue', 'smtp_forward');
};

var smtp_regexp = /^([0-9]{3})([ -])(.*)/;

exports.smtp_forward = function (next, connection) {
    this.loginfo("smtp forwarding");
    var smtp_config = this.config.get('smtp_forward.ini', 'ini');
    var socket = new sock.Socket();
    socket.connect(smtp_config.main.port, smtp_config.main.host);
    socket.setTimeout(300 * 1000);
    var self = this;
    var command = 'connect';
    var response = [];
    // copy the recipients:
    var recipients = connection.transaction.rcpt_to.map(function(item) { return item });
    var data_marker = 0;
    
    var send_data = function () {
        if (data_marker < connection.transaction.data_lines.length) {
            var wrote_all = socket.write(connection.transaction.data_lines[data_marker].replace(/^\./, '..'));
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
        this.write(line + "\r\n");
        command = cmd.toLowerCase();
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
        self.logdebug("S: " + line);
        if (matches = smtp_regexp.exec(line)) {
            var code = matches[1],
                cont = matches[2],
                rest = matches[3];
            response.push(rest);
            if (cont === ' ') {
                if (code.match(/^[45]/)) {
                    socket.send_command('QUIT');
                    return next(); // Fall through to other queue hooks here
                }
                switch (command) {
                    case 'connect':
                        socket.send_command('HELO', self.config.get('me'));
                        break;
                    case 'helo':
                        socket.send_command('MAIL', 'FROM:' + connection.transaction.mail_from);
                        break;
                    case 'mail':
                        socket.send_command('RCPT', 'TO:' + recipients.shift());
                        if (recipients.length) {
                            // don't move to next state if we have more recipients
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
        if (command === 'dot') {
            send_data();
        }
    });
};

