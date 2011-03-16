// Forward to an SMTP server as a proxy.
// Opens the connection to the ongoing SMTP server at MAIL FROM time
// and passes back any errors seen on the ongoing server to the originating server.

var os   = require('os');
var sock = require('./line_socket');

var smtp_regexp = /^([0-9]{3})([ -])(.*)/;

exports.hook_mail = function (callback, connection, params) {
    this.loginfo("smtp proxying");
    var mail_from = params[0];
    var smtp_proxy = {};
    smtp_proxy.config = this.config.get('smtp_proxy.ini', 'ini');
    smtp_proxy.socket = new sock.Socket();
    smtp_proxy.socket.connect(smtp_proxy.config.main.port, smtp_proxy.config.main.host);
    smtp_proxy.socket.setTimeout(300 * 1000); // 5m timeout
    var self = this;
    smtp_proxy.command = 'connect';
    smtp_proxy.response = [];
    var data_marker = 0;
    smtp_proxy.recipient_marker = 0;
    connection.transaction.notes.smtp_proxy = smtp_proxy;
    smtp_proxy.callback = callback;
    
    smtp_proxy.send_data = function () {
        if (data_marker < connection.transaction.data_lines.length) {
            var wrote_all = smtp_proxy.socket.write(connection.transaction.data_lines[data_marker].replace(/^\./, '..'));
            data_marker++;
            if (wrote_all) {
                smtp_proxy.send_data();
            }
        }
        else {
            smtp_proxy.socket.send_command('dot');
        }
    }
    
    smtp_proxy.socket.on('error', function (err) {
        self.logerror("Ongoing connection failed: " + err);
        // we don't deny on error - maybe another plugin can deliver
        callback(CONT); 
    });
    smtp_proxy.socket.on('timeout', function () {
        self.logerror("Ongoing connection timed out");
        smtp_proxy.socket.end();
        smtp_proxy.callback(CONT);
    });
    
    smtp_proxy.socket.on('connect', function () {});
    
    smtp_proxy.socket.send_command = function (cmd, data) {
        var line = cmd + (data ? (' ' + data) : '');
        if (cmd === 'dot') {
            line = '.';
        }
        self.logprotocol("Proxy C: " + line);
        this.write(line + "\r\n");
        smtp_proxy.command = cmd.toLowerCase();
    };
    
    smtp_proxy.socket.on('line', function (line) {
        var matches;
        self.logprotocol("Proxy S: " + line);
        if (matches = smtp_regexp.exec(line)) {
            var code = matches[1],
                cont = matches[2],
                rest = matches[3];
            smtp_proxy.response.push(rest);
            if (cont === ' ') {
                if (code.match(/^[45]/)) {
                    if (smtp_proxy.command !== 'rcpt') {
                        // errors are OK for rcpt, but nothing else
                        smtp_proxy.socket.send_command('QUIT');
                        smtp_proxy.command = 'quit';
                    }
                    return smtp_proxy.callback(code.match(/^4/) ? DENYSOFT : DENY, smtp_proxy.response);
                }
                smtp_proxy.response = []; // reset the response now we're done with it
                switch (smtp_proxy.command) {
                    case 'connect':
                        smtp_proxy.socket.send_command('HELO', self.config.get('me'));
                        break;
                    case 'helo':
                        smtp_proxy.socket.send_command('MAIL', 'FROM:' + mail_from);
                        break;
                    case 'mail':
                        return smtp_proxy.callback(CONT);
                    case 'rcpt':
                        return smtp_proxy.callback(OK);
                    case 'data':
                        return smtp_proxy.callback(CONT);
                    case 'dot':
                        smtp_proxy.socket.send_command('QUIT');
                        return smtp_proxy.callback(OK);
                    case 'quit':
                        smtp_proxy.socket.end();
                        break;
                    default:
                        throw "Unknown command: " + smtp_proxy.command;
                }
            }
        }
        else {
            // Unrecognised response.
            self.logerror("Unrecognised response from upstream server: " + line);
            smtp_proxy.socket.end();
            return callback(CONT); // maybe should be DENY?
        }
    });
    smtp_proxy.socket.on('drain', function() {
        self.logdebug("Drained");
        if (smtp_proxy.command === 'dot') {
            smtp_proxy.send_data();
        }
    });
};

exports.hook_rcpt = function (callback, connection, params) {
    var recipient = params[0];
    var smtp_proxy = connection.transaction.notes.smtp_proxy;
    smtp_proxy.callback = callback;
    smtp_proxy.socket.send_command('RCPT', 'TO:' + recipient);
};

exports.hook_data = function (callback, connection) {
    var smtp_proxy = connection.transaction.notes.smtp_proxy;
    smtp_proxy.callback = callback;
    smtp_proxy.socket.send_command("DATA");
};

exports.hook_queue = function (callback, connection) {
    var smtp_proxy = connection.transaction.notes.smtp_proxy;
    smtp_proxy.command = 'dot';
    smtp_proxy.callback = callback;
    smtp_proxy.send_data();
};
