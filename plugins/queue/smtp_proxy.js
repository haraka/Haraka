// Forward to an SMTP server as a proxy.
// Opens the connection to the ongoing SMTP server at MAIL FROM time
// and passes back any errors seen on the ongoing server to the originating server.

var os   = require('os');
var sock = require('./line_socket');

var smtp_regexp = /^([0-9]{3})([ -])(.*)/;

exports.hook_mail = function (next, connection, params) {
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
    smtp_proxy.next = next;
    
    smtp_proxy.send_data = function () {
        if (data_marker < connection.transaction.data_lines.length) {
            var wrote_all = smtp_proxy.socket.write(connection.transaction.data_lines[data_marker].replace(/^\./, '..').replace(/\r?\n/g, '\r\n'));
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
        smtp_proxy.socket.destroy();
        if (connection.transaction)
            delete connection.transaction.notes.smtp_proxy;
        // we don't deny on error - maybe another plugin can deliver
        smtp_proxy.next();
    });

    smtp_proxy.socket.on('timeout', function () {
        self.logerror("Ongoing connection timed out");
        smtp_proxy.socket.destroy();
        if (connection.transaction)
            delete connection.transaction.notes.smtp_proxy;
        smtp_proxy.next();
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
                    return smtp_proxy.next(code.match(/^4/) ? DENYSOFT : DENY, smtp_proxy.response);
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
                        return smtp_proxy.next();
                    case 'rcpt':
                        return smtp_proxy.next();
                    case 'data':
                        return smtp_proxy.next();
                    case 'dot':
                        smtp_proxy.socket.send_command('QUIT');
                        return smtp_proxy.next(OK);
                    case 'quit':
                        smtp_proxy.socket.destroySoon();
                        break;
                    default:
                        throw "Unknown command: " + smtp_proxy.command;
                }
            }
        }
        else {
            // Unrecognised response.
            self.logerror("Unrecognised response from upstream server: " + line);
            smtp_proxy.socket.destroy();
            return smtp_proxy.next(DENYSOFT);
        }
    });
    smtp_proxy.socket.on('drain', function() {
        self.logprotocol("Drained");
        if (smtp_proxy.command === 'dot') {
            smtp_proxy.send_data();
        }
    });
};

exports.hook_rcpt_ok = function (next, connection, recipient) {
    if (!connection.transaction.notes.smtp_proxy) return next();
    var smtp_proxy = connection.transaction.notes.smtp_proxy;
    smtp_proxy.next = next;
    smtp_proxy.socket.send_command('RCPT', 'TO:' + recipient);
};

exports.hook_data = function (next, connection) {
    if (!connection.transaction.notes.smtp_proxy) return next();
    var smtp_proxy = connection.transaction.notes.smtp_proxy;
    smtp_proxy.next = next;
    smtp_proxy.socket.send_command("DATA");
};

exports.hook_queue = function (next, connection) {
    if (!connection.transaction.notes.smtp_proxy) return next();
    var smtp_proxy = connection.transaction.notes.smtp_proxy;
    smtp_proxy.command = 'dot';
    smtp_proxy.next = next;
    smtp_proxy.send_data();
};
