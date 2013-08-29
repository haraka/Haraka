// avg
// TODO: this could use pooled connections

var fs = require('fs');
var sock = require('./line_socket');
var smtp_regexp = /^([0-9]{3})([ -])(.*)/;

exports.hook_data_post = function (next, connection) {
    var self = this;
    var txn = connection.transaction;
    if (!txn) return next();
    var cfg = this.config.get('avg.ini');

    var tmpdir = cfg.main.tmpdir || '/tmp';
    var tmpfile = tmpdir + '/' + txn.uuid + '.tmp';
    var ws = fs.createWriteStream(tmpfile);

    ws.once('error', function(err) {
        connection.logerror(self, 'Error writing temporary file: ' + err.message);
        return next(DENYSOFT, 'Virus scanner error (AVG)');
    });

    ws.once('close', function() {
        var start_time = Date.now();
        var socket = new sock.Socket();
        socket.setTimeout((cfg.main.connect_timeout || 10) * 1000);
        var connected = false;
        var command = 'connect';
        var response = [];

        var do_next = function (code, msg) {
            fs.unlink(tmpfile, function(){});
            return next(code, msg);
        }

        socket.send_command = function (cmd, data) {
            var line = cmd + (data ? (' ' + data) : '');
            connection.logprotocol(self, '> ' + line);
            this.write(line + "\r\n");
            command = cmd.toLowerCase();
            response = [];
        };

        socket.on('timeout', function () {
            connection.logerror(self, (connected ? 'connection' : 'session') +  ' timed out');
            return do_next(DENYSOFT, 'Virus scanner timeout (AVG)');
        });
        socket.on('error', function (err) {
            connection.logerror(self, err.message);
            return do_next(DENYSOFT, 'Virus scanner error (AVG)');
        });
        socket.on('connect', function () {
            connected = true;
            this.setTimeout((cfg.main.session_timeout || 30) * 1000);
        });
        socket.on('line', function (line) {
            var matches;
            connection.logprotocol(self, '< ' + line);
            if (matches = smtp_regexp.exec(line)) {
                var code = matches[1],
                    cont = matches[2],
                    rest = matches[3];
                response.push(rest);
                if (cont === ' ') {
                    switch (command) {
                        case 'connect':
                            if (code !== '220') {
                                // Error
                                connection.logerror(self, 'Unrecognised response: ' + line);
                                return do_next(DENYSOFT, 'Virus scanner error (AVG)');
                            }
                            else {
                                socket.send_command('SCAN', tmpfile);
                            }
                            break;
                        case 'scan':
                            var end_time = Date.now();
                            var elapsed = end_time - start_time;
                            connection.loginfo(self, 'time=' + elapsed + 'ms ' +
                                                     'code=' + code + ' ' +
                                                     'response="' + response.join(' ') + '"');
                            // Check code
                            switch (code) {
                                case '200':  // 200 ok
                                    // Message did not contain a virus
                                    socket.send_command('QUIT');
                                    return do_next();
                                    break;
                                case '403':  // 403 File 'eicar.com' infected: 'Virus identified EICAR_Test'
                                    // Virus found
                                    do_next(DENY, response.join(' '));
                                    return socket.send_command('QUIT');
                                    break;
                                default:  
                                    // Any other result is an error
                                    connection.logerror(self, 'Bad response: ' + response.join(' '));
                            }
                            socket.send_command('QUIT');
                            return do_next(DENYSOFT, 'Virus scanner error (AVG)');
                            break;
                        case 'quit':
                            socket.end();
                            break;
                        default:
                            throw new Error('Unknown command: ' + command);
                    }
                }
            }
            else {
                connection.logerror(self, 'Unrecognised response: ' + line);
                socket.end();
                return do_next(DENYSOFT, 'Virus scanner error (AVG)');
            }
        });
        socket.connect((cfg.main.port || 54322), cfg.main.host);
    });

    txn.message_stream.pipe(ws, { line_endings: '\r\n' });
}
