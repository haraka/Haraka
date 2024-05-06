// Proxy AUTH requests selectively by domain

const net = require('node:net')

const utils = require('haraka-utils');
const net_utils = require('haraka-net-utils')

const smtp_regexp = /^(\d{3})([ -])(.*)/;

exports.register = function () {
    this.inherits('auth/auth_base');
    this.load_tls_ini();
}

exports.load_tls_ini = function () {
    this.tls_cfg = this.config.get('tls.ini', () => {
        this.load_tls_ini();
    });
}

exports.hook_capabilities = (next, connection) => {
    if (connection.tls.enabled) {
        const methods = [ 'PLAIN', 'LOGIN' ];
        connection.capabilities.push(`AUTH ${methods.join(' ')}`);
        connection.notes.allowed_auth_methods = methods;
    }
    next();
}

exports.check_plain_passwd = function (connection, user, passwd, cb) {
    let domain = /@([^@]+)$/.exec(user);
    if (domain) {
        domain = domain[1].toLowerCase();
    }
    else {
        // AUTH user not in user@domain.com format
        connection.logerror(this, `AUTH user="${user}" error="not in required format"`);
        return cb(false);
    }

    // Check if domain exists in configuration file
    const config = this.config.get('auth_proxy.ini');
    if (!config.domains[domain]) {
        connection.logerror(this, `AUTH user="${user}" error="domain '${domain}' is not defined"`);
        return cb(false);
    }

    this.try_auth_proxy(connection, config.domains[domain].split(/[,; ]/), user, passwd, cb);
}

exports.try_auth_proxy = function (connection, hosts, user, passwd, cb) {
    if (!hosts || (hosts && !hosts.length)) return cb(false);
    if (typeof hosts !== 'object') {
        hosts = [ hosts ];
    }

    const self = this;
    let [ host, port ] = hosts.shift().split(':'); /* eslint prefer-const: 0 */
    if (!port) port = 25
    let methods = [];
    let auth_complete = false;
    let auth_success = false;
    let command = 'connect';
    let response = [];
    let secure = false;

    const socket = net.connect({ host, port });
    net_utils.add_line_processor(socket)
    connection.logdebug(this, `attempting connection to host=${host} port=${port}`);
    socket.setTimeout(30 * 1000);
    socket.on('connect', () => { });
    socket.on('close', () => {
        if (!auth_complete) {
            // Try next host
            return this.try_auth_proxy(connection, hosts, user, passwd, cb);
        }
        connection.loginfo(this, `AUTH user="${user}" host="${host}" success=${auth_success}`);
        cb(auth_success);
    });
    socket.on('timeout', () => {
        connection.logerror(this, "connection timed out");
        socket.end();
        // Try next host
        this.try_auth_proxy(connection, hosts, user, passwd, cb);
    });
    socket.on('error', err => {
        connection.logerror(this, `connection failed to host ${host}: ${err}`);
        socket.end();
    });
    socket.send_command = function (cmd, data) {
        let line = cmd + (data ? (` ${data}`) : '');
        if (cmd === 'dot') {
            line = '.';
        }
        connection.logprotocol(self, `C: ${line}`);
        command = cmd.toLowerCase();
        this.write(`${line}\r\n`);
        // Clear response buffer from previous command
        response = [];
    };
    socket.on('line', function (line) {
        connection.logprotocol(self, `S: ${line}`);
        const matches = smtp_regexp.exec(line);
        if (!matches) {
            connection.logerror(self, `unrecognised response: ${line}`);
            socket.end();
            return;
        }

        const code = matches[1];
        const cont = matches[2];
        const rest = matches[3];
        response.push(rest);
        if (cont !== ' ') return;

        let key;
        let cert;

        connection.logdebug(self, `command state: ${command}`);
        if (command === 'ehlo') {
            if (code.startsWith('5')) {
                // EHLO command rejected; abort
                socket.send_command('QUIT');
                return;
            }
            // Parse CAPABILITIES
            for (const i in response) {
                if (/^STARTTLS/.test(response[i])) {
                    if (secure) continue;    // silly remote, we've already upgraded
                    // Use TLS opportunistically if we found the key and certificate
                    key = self.config.get(self.tls_cfg.main.key || 'tls_key.pem', 'binary');
                    cert = self.config.get(self.tls_cfg.main.cert || 'tls_cert.pem', 'binary');
                    if (key && cert) {
                        this.on('secure', () => {
                            if (secure) return;
                            secure = true;
                            socket.send_command('EHLO', connection.local.host);
                        });
                        socket.send_command('STARTTLS');
                        return;
                    }
                }
                else if (/^AUTH /.test(response[i])) {
                    // Parse supported AUTH methods
                    const parse = /^AUTH (.+)$/.exec(response[i]);
                    methods = parse[1].split(/\s+/);
                    connection.logdebug(self, `found supported AUTH methods: ${methods}`);
                    // Prefer PLAIN as it's easiest
                    if (methods.includes('PLAIN')) {
                        socket.send_command('AUTH',`PLAIN ${utils.base64(`\0${user}\0${passwd}`)}`);
                        return;
                    }
                    else if (methods.includes('LOGIN')) {
                        socket.send_command('AUTH','LOGIN');
                        return;
                    }
                    else {
                        // No compatible methods; abort...
                        connection.logdebug(self, 'no compatible AUTH methods');
                        socket.send_command('QUIT');
                        return;
                    }
                }
            }
        }
        if (command === 'auth') {
            // Handle LOGIN
            if (code.startsWith('3') && response[0] === 'VXNlcm5hbWU6') {
                // Write to the socket directly to keep the state at 'auth'
                this.write(`${utils.base64(user)}\r\n`);
                response = [];
                return;
            }
            else if (code.startsWith('3') && response[0] === 'UGFzc3dvcmQ6') {
                this.write(`${utils.base64(passwd)}\r\n`);
                response = [];
                return;
            }
            if (code.startsWith('5')) {
                // Initial attempt failed; strip domain and retry.
                const u = /^([^@]+)@.+$/.exec(user)
                if (u) {
                    user = u[1];
                    if (methods.includes('PLAIN')) {
                        socket.send_command('AUTH', `PLAIN ${utils.base64(`\0${user}\0${passwd}`)}`);
                    }
                    else if (methods.includes('LOGIN')) {
                        socket.send_command('AUTH', 'LOGIN');
                    }
                    return;
                }
                else {
                    // Don't attempt any other hosts
                    auth_complete = true;
                }
            }
        }
        if (/^[345]/.test(code)) {
            // Got an unhandled error
            connection.logdebug(self, `error: ${line}`);
            socket.send_command('QUIT');
            return;
        }
        switch (command) {
            case 'starttls':
                this.upgrade({ key, cert });
                break;
            case 'connect':
                socket.send_command('EHLO', connection.local.host);
                break;
            case 'auth':
                // AUTH was successful
                auth_complete = true;
                auth_success = true;
                socket.send_command('QUIT');
                break;
            case 'ehlo':
            case 'helo':
            case 'quit':
                socket.end();
                break;
            default:
                throw new Error(`[auth/auth_proxy] unknown command: ${command}`);
        }
    });
}
