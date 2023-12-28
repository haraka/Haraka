// Auth against vpopmaild

const net    = require('net');

const tlds   = require('haraka-tld')

exports.register = function () {
    this.inherits('auth/auth_base');
    this.load_vpop_ini();

    this.register_hook('mail', 'env_from_matches_auth_domain')
}

exports.load_vpop_ini = function () {
    this.cfg = this.config.get('auth_vpopmaild.ini', () => {
        this.load_vpop_ini();
    });
    this.blankout_password=true
}

exports.hook_capabilities = function (next, connection) {
    if (!connection.tls.enabled) { return next(); }

    const methods = [ 'PLAIN', 'LOGIN' ];
    if (this.cfg.main.sysadmin) methods.push('CRAM-MD5');

    connection.capabilities.push(`AUTH ${methods.join(' ')}`);
    connection.notes.allowed_auth_methods = methods;

    next();
}

exports.check_plain_passwd = function (connection, user, passwd, cb) {

    let chunk_count = 0;
    let auth_success = false;

    const socket = this.get_vpopmaild_socket(user);
    socket.setEncoding('utf8');

    socket.on('data', chunk => {
        chunk_count++;
        if (chunk_count === 1) {
            if (/^\+OK/.test(chunk)) {
                socket.write(`slogin ${user} ${passwd}\n\r`);
                return;
            }
            socket.end();
        }
        if (chunk_count === 2) {
            if (/^\+OK/.test(chunk)) {    // slogin reply
                auth_success = true;
                socket.write("quit\n\r");
            }
            socket.end();             // disconnect
        }
    })

    socket.on('end', () => {
        connection.loginfo(this, `AUTH user="${user}" success=${auth_success}`);
        cb(auth_success);
    })
}

exports.get_sock_opts = function (user) {

    this.sock_opts = {
        port: 89,
        host: '127.0.0.1',
        sysadmin: undefined,
    };

    const domain = (user.split('@'))[1];
    let sect = this.cfg.main;
    if (domain && this.cfg[domain]) {
        sect = this.cfg[domain];
    }

    if (sect.port)     { this.sock_opts.port     = sect.port;     }
    if (sect.host)     { this.sock_opts.host     = sect.host;     }
    if (sect.sysadmin) { this.sock_opts.sysadmin = sect.sysadmin; }

    this.logdebug(`sock: ${this.sock_opts.host}:${this.sock_opts.port}`);
    return this.sock_opts;
}

exports.get_vpopmaild_socket = function (user) {
    this.get_sock_opts(user);

    const socket = new net.Socket();
    socket.connect(this.sock_opts.port, this.sock_opts.host);
    socket.setTimeout(300 * 1000);
    socket.setEncoding('utf8');

    socket.on('timeout', () => {
        this.logerror("vpopmaild connection timed out");
        socket.end();
    });
    socket.on('error', err => {
        this.logerror(`vpopmaild connection failed: ${err}`);
        socket.end();
    });
    socket.on('connect', () => {
        this.logdebug('vpopmail connected');
    });
    return socket;
}

exports.get_plain_passwd = function (user, connection, cb) {

    const socket = this.get_vpopmaild_socket(user);
    if (!this.sock_opts.sysadmin) {
        this.logerror("missing sysadmin credentials");
        return cb(null);
    }

    const sys = this.sock_opts.sysadmin.split(':');
    let plain_pass = null;
    let chunk_count = 0;

    socket.on('data', chunk => {
        chunk_count++;
        this.logdebug(`${chunk_count}\t${chunk}`);
        if (chunk_count === 1) {
            if (/^\+OK/.test(chunk)) {
                socket.write(`slogin ${sys[0]} ${sys[1]}\n\r`);
                return;
            }
            this.logerror("no ok to start");
            socket.end();             // disconnect
        }
        // slogin reply
        if (chunk_count === 2) {
            if (/^\+OK/.test(chunk)) {
                this.logdebug('login success, getting user info');
                socket.write(`user_info ${user}\n\r`);
                return;
            }
            this.logerror("syadmin login failed");
            socket.end();             // disconnect
        }
        if (chunk_count > 2) {
            if (/^-ERR/.test(chunk)) {
                this.lognotice(`get_plain failed: ${chunk}`);
                socket.end();         // disconnect
                return;
            }
            if (!/clear_text_password/.test(chunk)) {
                return;   // pass might be in the next chunk
            }
            const pass = chunk.match(/clear_text_password\s(\S+)\s/);
            plain_pass = pass[1];
            socket.write("quit\n\r");
        }
    });
    socket.on('end', () => {
        cb(plain_pass ? plain_pass.toString() : plain_pass);
    });
}

exports.env_from_matches_auth_domain = function (next, connection, params) {
    const au = connection.results.get('auth')?.user
    if (!au) return next()

    const ad = /@/.test(au) ? au.split('@').pop() : au
    const ed = params[0].host

    if (!ad || !ed) return next()

    const auth_od = tlds.get_organizational_domain(ad)
    const envelope_od = tlds.get_organizational_domain(ed)

    if (auth_od === envelope_od) return next()

    next(DENY, `Envelope domain '${envelope_od}' doesn't match AUTH domain '${auth_od}'`)
}
