// Forward to an SMTP server as a proxy.
// Opens the connection to the ongoing SMTP server at MAIL FROM time
// and passes back any errors seen on the ongoing server to the originating server.

var sock = require('./line_socket');
var smtp_regexp = /^([0-9]{3})([ -])(.*)/;

// Local function to get an smtp_proxy connection.
// This function will either choose one from the pool or make new one.
function _get_smtp_proxy(self, next, connection) {
    var smtp_proxy = {};

    if (connection.server.notes.smtp_proxy_pool &&
        connection.server.notes.smtp_proxy_pool.length) {
        connection.logdebug(self, "using connection from the pool: (" +
            connection.server.notes.smtp_proxy_pool.length + ")");

        smtp_proxy = connection.server.notes.smtp_proxy_pool.shift();

        // We should just reset these things when we shift a connection off
        // since we have to setup stuff based on _this_ connection.
        smtp_proxy.response = [];
        smtp_proxy.recipient_marker = 0;
        smtp_proxy.pool_connection = 1;
        connection.notes.smtp_proxy = smtp_proxy;
        smtp_proxy.next = next;

        // Cleanup all old event listeners
        // Note, if new ones are added in the mail from handler,
        // please remove them here.
        smtp_proxy.socket.removeAllListeners('error');
        smtp_proxy.socket.removeAllListeners('timeout');
        smtp_proxy.socket.removeAllListeners('close');
        smtp_proxy.socket.removeAllListeners('connect');
        smtp_proxy.socket.removeAllListeners('line');
        smtp_proxy.socket.removeAllListeners('drain');
    } else {
        smtp_proxy.config = self.config.get('smtp_proxy.ini');
        smtp_proxy.socket = sock.connect(smtp_proxy.config.main.port,
            smtp_proxy.config.main.host);
        smtp_proxy.socket.setTimeout((smtp_proxy.config.main.timeout) ?
            (smtp_proxy.config.main.timeout * 1000) : (300 * 1000));
        smtp_proxy.command = 'connect';
        smtp_proxy.response = [];
        smtp_proxy.recipient_marker = 0;
        smtp_proxy.pool_connection = 0;
        connection.notes.smtp_proxy = smtp_proxy;
        smtp_proxy.next = next;
    }

    if (connection.server.notes.active_proxy_conections >= 0) {
        connection.server.notes.active_proxy_conections++;
    } else {
        connection.server.notes.active_proxy_conections = 1;
    }

    connection.logdebug(self, "active proxy connections: (" +
        connection.server.notes.active_proxy_conections + ")");

    return smtp_proxy;
}

// function will destroy an smtp_proxy and pull it out of the idle array
function _destroy_smtp_proxy(self, connection, smtp_proxy) {
    var reset_active_connections = 0;
    var index;

    if (smtp_proxy && smtp_proxy.socket) {
        connection.logdebug(self, "destroying proxy connection");
        smtp_proxy.socket.destroySoon();
        smtp_proxy.socket = 0;
        reset_active_connections = 1;
    }

    // Unlink the connection from the proxy just in case we got here
    // without that happening already.
    if (connection && connection.notes.smtp_proxy) {
        delete connection.notes.smtp_proxy;
    }

    if (connection.server.notes.smtp_proxy_pool) {
        // Pull that smtp_proxy from the proxy pool.
        // Note we do not do this operation that often.
        index = connection.server.notes.smtp_proxy_pool.indexOf(smtp_proxy);
        if (index != -1) {
            // if we are pulling something from the proxy pool, it is not
            // acttive.  This means we do not want to reset it.
            reset_active_connections = 0;
            connection.server.notes.smtp_proxy_pool.splice(index, 1);
            connection.logdebug(self, "pulling dead proxy connection from pool: (" +
                connection.server.notes.smtp_proxy_pool.length + ")");
        }
    }

    if (reset_active_connections &&
        connection.server.notes.active_proxy_conections) {
        connection.server.notes.active_proxy_conections--;
        connection.logdebug(self, "active proxy connections: (" +
            connection.server.notes.active_proxy_conections + ")");
    }

    return;
}

function _smtp_proxy_idle(self, connection) {
    var smtp_proxy = connection.notes.smtp_proxy;

    if (!(smtp_proxy)) {
        return;
    }

    if (connection.server.notes.smtp_proxy_pool) {
        connection.server.notes.smtp_proxy_pool.push(smtp_proxy);
    } else {
        connection.server.notes.smtp_proxy_pool = [ smtp_proxy ];
    }

    connection.server.notes.active_proxy_conections--;

    connection.logdebug(self, "putting proxy connection back in pool: (" +
        connection.server.notes.smtp_proxy_pool.length + ")");
    connection.logdebug(self, "active proxy connections: (" +
        connection.server.notes.active_proxy_conections + ")");

    // Unlink this connection from the proxy now that it is back
    // in the pool.
    if (connection && connection.notes.smtp_proxy) {
        delete connection.notes.smtp_proxy;
    }

    return;
}

exports.hook_mail = function (next, connection, params) {
    connection.loginfo(this, "proxying");
    var self = this;
    var mail_from = params[0];
    var data_marker = 0;
    var smtp_proxy = _get_smtp_proxy(self, next, connection);
    var in_write = false;
    var dot_pending = true;

    smtp_proxy.send_data = function () {
        var wrote_all = true;
        while (wrote_all && (data_marker < connection.transaction.data_lines.length)) {
            var line = connection.transaction.data_lines[data_marker];
            data_marker++;
            connection.logdata(self, "C: " + line);
            // this protection is due to bug #
            in_write = true;
            wrote_all = smtp_proxy.socket.write(line.replace(/^\./, '..').replace(/\r?\n/g, '\r\n'));
            in_write = false;
            if (!wrote_all) {
                return;
            }
        }
        // we get here if wrote_all still true, and we got to end of data_lines
        if (dot_pending) {
            dot_pending = false;
            smtp_proxy.socket.send_command('dot');
        }
    }

    // Add socket event listeners.    
    // Note, if new ones are added here, please remove them in _get_smtp_proxy.

    smtp_proxy.socket.on('drain', function() {
        if (dot_pending && smtp_proxy.command === 'mailbody') {
            process.nextTick(function () { smtp_proxy.send_data() });
        }
    });

    smtp_proxy.socket.on('error', function (err) {
        connection.logdebug(self, "Ongoing connection failed: " + err);
        _destroy_smtp_proxy(self, connection, smtp_proxy);
        return next(DENYSOFT,'Proxy connection failed');
    });

    smtp_proxy.socket.on('timeout', function () {
        connection.logdebug(self, "Ongoing connection timed out");
        _destroy_smtp_proxy(self, connection, smtp_proxy);
    });
    
    smtp_proxy.socket.on('close', function (had_error) {
        connection.logdebug(self, "Ongoing connection closed");
        _destroy_smtp_proxy(self, connection, smtp_proxy);
    });

    smtp_proxy.socket.on('connect', function () {});
    
    smtp_proxy.socket.send_command = function (cmd, data) {
        var line = cmd + (data ? (' ' + data) : '');
        if (cmd === 'dot') {
            line = '.';
        }
        connection.logprotocol(self, "C: " + line);
        this.write(line + "\r\n");
        smtp_proxy.command = cmd.toLowerCase();
        smtp_proxy.response = [];
    };
    
    smtp_proxy.socket.on('line', function (line) {
        var matches;
        connection.logprotocol(self, "S: " + line);
        if (matches = smtp_regexp.exec(line)) {
            var code = matches[1],
                cont = matches[2],
                rest = matches[3];
            smtp_proxy.response.push(rest);
            if (cont === ' ') {
                if (smtp_proxy.command === 'ehlo') {
                    // Handle fallback to HELO if EHLO is rejected
                    if (code.match(/^5/)) {
                        if (smtp_proxy.xclient) {
                            smtp_proxy.socket.send_command('HELO',
                                connection.hello_host);
                        } 
                        else {
                            smtp_proxy.socket.send_command('HELO',
                                self.config.get('me'));
                        }
                        return;
                    }
                    // Parse CAPABILITIES
                    for (var i in smtp_proxy.response) {
                        if (smtp_proxy.response[i].match(/^XCLIENT/)) {
                            if (!smtp_proxy.xclient) {
                                smtp_proxy.socket.send_command('XCLIENT',
                                    'ADDR=' + connection.remote_ip);
                                return;
                            }
                        }
                        if (smtp_proxy.response[i].match(/^STARTTLS/)) {
                            var key = self.config.get('tls_key.pem', 'data').join("\n");
                            var cert = self.config.get('tls_cert.pem', 'data').join("\n");
                            if (key && cert && (/(true|yes|1)/i.exec(smtp_proxy.config.main.enable_tls))) {
                                this.on('secure', function () {
                                    smtp_proxy.socket.send_command('EHLO', self.config.get('me'));
                                });
                                smtp_proxy.socket.send_command('STARTTLS');
                                return;
                            }
                        }
                    }
                }
                if (smtp_proxy.command === 'xclient' && code.match(/^5/)) {
                    // XCLIENT rejected; continue without it
                    smtp_proxy.command = 'helo';
                }
                else if (code.match(/^[45]/)) {
                    if (smtp_proxy.command !== 'rcpt') {
                        // errors are OK for rcpt, but nothing else
                        // this can also happen if the destination server
                        // times out, but that is okay.
                        connection.loginfo(self, "message denied, proxying failed");
                        smtp_proxy.socket.send_command('RSET');
                    }
                    return smtp_proxy.next(code.match(/^4/) ?
                        DENYSOFT : DENY, smtp_proxy.response);
                }
                switch (smtp_proxy.command) {
                    case 'xclient':
                        smtp_proxy.xclient = true;
                        smtp_proxy.socket.send_command('EHLO',
                            connection.hello_host);
                        break;
                    case 'starttls':
                        var tls_options = { key: key, cert: cert };
                        smtp_proxy.socket.upgrade(tls_options);
                        break;
                    case 'connect':
                        smtp_proxy.socket.send_command('EHLO',
                            self.config.get('me'));
                        break;
                    case 'ehlo':
                    case 'helo':
                        smtp_proxy.socket.send_command('MAIL',
                            'FROM:' + mail_from);
                        break;
                    case 'mail':
                        smtp_proxy.next();
                        break;
                    case 'rcpt':
                        smtp_proxy.next();
                        break;
                    case 'data':
                        smtp_proxy.next();
                        break;
                    case 'dot':
                        connection.loginfo(self, "message delivered, proxying complete");
                        smtp_proxy.next(OK, smtp_proxy.response + ' (' + connection.transaction.uuid + ')');
                        smtp_proxy.socket.send_command('RSET');
                        break;
                    case 'rset':
                        _smtp_proxy_idle(self, connection);
                        // We do not call next() here because many paths
                        // lead to this conclusion, and next() is called
                        // on a case-by-case basis.
                        break;
                    default:
                        throw "Unknown command: " + smtp_proxy.command;
                }
            }
        }
        else {
            // Unrecognised response.
            connection.logerror(self, "Unrecognised response from upstream server: " + line);
            connection.loginfo(self, "message denied, proxying failed");
            smtp_proxy.socket.send_command('RSET');
            return smtp_proxy.next(DENYSOFT);
        }
    });

    if (smtp_proxy.pool_connection) {
        // If we used XCLIENT earlier; we *must* re-send it again
        // To update the proxy with the new client details.
        if (smtp_proxy.xclient) {
            smtp_proxy.socket.send_command('XCLIENT',
                'ADDR=' + connection.remote_ip);
        }
        else {
            smtp_proxy.socket.send_command('MAIL', 'FROM:' + mail_from);
        }
    }
};

exports.hook_rcpt_ok = function (next, connection, recipient) {
    if (!connection.notes.smtp_proxy) return next();
    var smtp_proxy = connection.notes.smtp_proxy;
    smtp_proxy.next = next;
    smtp_proxy.socket.send_command('RCPT', 'TO:' + recipient);
};

exports.hook_data = function (next, connection) {
    if (!connection.notes.smtp_proxy) return next();
    var smtp_proxy = connection.notes.smtp_proxy;
    smtp_proxy.next = next;
    smtp_proxy.socket.send_command("DATA");
};

exports.hook_queue = function (next, connection) {
    if (!connection.notes.smtp_proxy) return next();
    var smtp_proxy = connection.notes.smtp_proxy;
    smtp_proxy.command = 'mailbody';
    smtp_proxy.next = next;
    smtp_proxy.send_data();
};

exports.hook_rset = function (next, connection) {
    this.rset_proxy(next, connection);
}

exports.hook_quit = function (next, connection) {
    this.rset_proxy(next, connection);
}

exports.rset_proxy = function (next, connection) {
    if (!connection.notes.smtp_proxy) return next();
    var smtp_proxy = connection.notes.smtp_proxy;
    smtp_proxy.next = next;
    smtp_proxy.socket.send_command("RSET");
    smtp_proxy.next(OK);
};
