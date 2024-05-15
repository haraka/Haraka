// Base authentication plugin.
// This cannot be used on its own. You need to inherit from it.
// See plugins/auth/flat_file.js for an example.

// Note: You can disable setting `connection.notes.auth_passwd` by `plugin.blankout_password = true`

const crypto = require('node:crypto');

const tlds   = require('haraka-tld')
const utils  = require('haraka-utils');

const AUTH_COMMAND = 'AUTH';
const AUTH_METHOD_CRAM_MD5 = 'CRAM-MD5';
const AUTH_METHOD_PLAIN = 'PLAIN';
const AUTH_METHOD_LOGIN = 'LOGIN';
const LOGIN_STRING1 = 'VXNlcm5hbWU6'; //Username: base64 coded
const LOGIN_STRING2 = 'UGFzc3dvcmQ6'; //Password: base64 coded

exports.hook_capabilities = (next, connection) => {
    // Don't offer AUTH capabilities unless session is encrypted
    if (!connection.tls.enabled) return next();

    const methods = [ 'PLAIN', 'LOGIN', 'CRAM-MD5' ];
    connection.capabilities.push(`AUTH ${methods.join(' ')}`);
    connection.notes.allowed_auth_methods = methods;
    next();
}

// Override this at a minimum. Run cb(passwd) to provide a password.
exports.get_plain_passwd = (user, connection, cb) => cb()

exports.hook_unrecognized_command = function (next, connection, params) {
    if (params[0].toUpperCase() === AUTH_COMMAND && params[1]) {
        return this.select_auth_method(next, connection, params.slice(1).join(' '));
    }
    if (!connection.notes.authenticating) return next();

    const am = connection.notes.auth_method;
    if (am === AUTH_METHOD_CRAM_MD5 && connection.notes.auth_ticket) {
        return this.auth_cram_md5(next, connection, params);
    }
    if (am === AUTH_METHOD_LOGIN) {
        return this.auth_login(next, connection, params);
    }
    if (am === AUTH_METHOD_PLAIN) {
        return this.auth_plain(next, connection, params);
    }
    next();
}

exports.check_plain_passwd = function (connection, user, passwd, cb) {
    function callback (plain_pw) {
        cb(plain_pw === null ? false : plain_pw === passwd);
    }
    if (this.get_plain_passwd.length == 2) {
        this.get_plain_passwd(user, callback);
    }
    else if (this.get_plain_passwd.length == 3) {
        this.get_plain_passwd(user, connection, callback);
    }
    else {
        throw 'Invalid number of arguments for get_plain_passwd';
    }
}

exports.check_cram_md5_passwd = function (connection, user, passwd, cb) {
    function callback (plain_pw) {
        if (plain_pw == null) return cb(false);

        const hmac = crypto.createHmac('md5', plain_pw.toString());
        hmac.update(connection.notes.auth_ticket);

        if (hmac.digest('hex') === passwd) return cb(true);

        cb(false);
    }
    if (this.get_plain_passwd.length == 2) {
        this.get_plain_passwd(user, callback);
    }
    else if (this.get_plain_passwd.length == 3) {
        this.get_plain_passwd(user, connection, callback);
    }
    else {
        throw 'Invalid number of arguments for get_plain_passwd';
    }
}

exports.check_user = function (next, connection, credentials, method) {
    const plugin = this;
    connection.notes.authenticating = false;
    if (!(credentials[0] && credentials[1])) {
        connection.respond(504, 'Invalid AUTH string', () => {
            connection.reset_transaction(() => next(OK));
        });
        return;
    }

    // valid: (true|false)
    // opts: ({ message, code }|String)
    function passwd_ok (valid, opts) {
        const status_code = (typeof(opts) === 'object' && opts.code) || (valid ? 235 : 535);
        const status_message = (typeof(opts) === 'object' ? opts.message : opts) ||
                (valid  ? '2.7.0 Authentication successful' : '5.7.8 Authentication failed');

        if (valid) {
            connection.relaying = true;
            connection.results.add({name:'relay'}, {pass: plugin.name});
            connection.results.add(plugin, {pass: method});

            connection.results.add({name:'auth'}, {
                pass: plugin.name,
                method,
                user: credentials[0],
            });

            connection.respond(status_code, status_message, () => {
                connection.authheader = "(authenticated bits=0)\n";
                connection.auth_results(`auth=pass (${method.toLowerCase()})`);
                connection.notes.auth_user = credentials[0];
                if (!plugin.blankout_password) connection.notes.auth_passwd = credentials[1];
                next(OK);
            });
            return;
        }

        if (!connection.notes.auth_fails) connection.notes.auth_fails = 0;

        connection.notes.auth_fails++;
        connection.results.add({name: 'auth'}, { fail:`${plugin.name}/${method}` });

        let delay = Math.pow(2, connection.notes.auth_fails - 1);
        if (plugin.timeout && delay >= plugin.timeout) {
            delay = plugin.timeout - 1;
        }
        connection.lognotice(plugin, `delaying for ${delay} seconds`);
        // here we include the username, as shown in RFC 5451 example
        connection.auth_results(`auth=fail (${method.toLowerCase()}) smtp.auth=${credentials[0]}`);
        setTimeout(() => {
            connection.respond(status_code, status_message, () => {
                connection.reset_transaction(() => next(OK));
            });
        }, delay * 1000);
    }

    if (method === AUTH_METHOD_PLAIN || method === AUTH_METHOD_LOGIN) {
        plugin.check_plain_passwd(connection, credentials[0], credentials[1], passwd_ok);
    }
    else if (method === AUTH_METHOD_CRAM_MD5) {
        plugin.check_cram_md5_passwd(connection, credentials[0], credentials[1], passwd_ok);
    }
}

exports.select_auth_method = function (next, connection, method) {
    const split = method.split(/\s+/);
    method = split.shift().toUpperCase();
    if (!connection.notes.allowed_auth_methods) return next();
    if (!connection.notes.allowed_auth_methods.includes(method)) return next();

    if (connection.notes.authenticating) return next(DENYDISCONNECT, 'bad protocol');

    connection.notes.authenticating = true;
    connection.notes.auth_method = method;

    if (method === AUTH_METHOD_PLAIN) return this.auth_plain(next, connection, split);
    if (method === AUTH_METHOD_LOGIN) return this.auth_login(next, connection, split);
    if (method === AUTH_METHOD_CRAM_MD5) return this.auth_cram_md5(next, connection);
}

exports.auth_plain = function (next, connection, params) {
    // one parameter given on line, either:
    //    AUTH PLAIN <param> or
    //    AUTH PLAIN\n
    //...
    //    <param>
    if (params[0]) {
        const credentials = utils.unbase64(params[0]).split(/\0/);
        credentials.shift();  // Discard authid
        this.check_user(next, connection, credentials, AUTH_METHOD_PLAIN);
        return
    }

    if (connection.notes.auth_plain_asked_login) {
        return next(DENYDISCONNECT, 'bad protocol');
    }

    connection.respond(334, ' ', () => {
        connection.notes.auth_plain_asked_login = true;
        next(OK);
    });
}

exports.auth_login = function (next, connection, params) {
    if ((!connection.notes.auth_login_asked_login && params[0]) ||
        ( connection.notes.auth_login_asked_login &&
         !connection.notes.auth_login_userlogin)) {

        if (!params[0]) return next(DENYDISCONNECT, 'bad protocol');

        const login = utils.unbase64(params[0]);
        connection.respond(334, LOGIN_STRING2, () => {
            connection.notes.auth_login_userlogin = login;
            connection.notes.auth_login_asked_login = true;
            next(OK);
        });
        return;
    }

    if (connection.notes.auth_login_userlogin) {
        const credentials = [
            connection.notes.auth_login_userlogin,
            utils.unbase64(params[0])
        ];

        connection.notes.auth_login_userlogin = null;
        connection.notes.auth_login_asked_login = false;

        return this.check_user(next, connection, credentials, AUTH_METHOD_LOGIN);
    }

    connection.respond(334, LOGIN_STRING1, () => {
        connection.notes.auth_login_asked_login = true;
        next(OK);
    });
}

exports.auth_cram_md5 = function (next, connection, params) {
    if (params) {
        const credentials = utils.unbase64(params[0]).split(' ');
        return this.check_user(next, connection, credentials, AUTH_METHOD_CRAM_MD5);
    }

    const ticket = `<${this.hexi(Math.floor(Math.random() * 1000000))}.${this.hexi(Date.now())}@${connection.local.host}>`;

    connection.loginfo(this, `ticket: ${ticket}`);
    connection.respond(334, utils.base64(ticket), () => {
        connection.notes.auth_ticket = ticket;
        next(OK);
    });
}

exports.hexi = number => String(Math.abs(parseInt(number)).toString(16))

exports.constrain_sender = function (next, connection, params) {
    if (this?.cfg?.main?.constrain_sender === false) return next()

    const au = connection.results.get('auth')?.user
    if (!au) return next()

    const ad = /@/.test(au) ? au.split('@').pop() : null
    const ed = params[0].host

    if (!ad || !ed) return next()

    const auth_od = tlds.get_organizational_domain(ad)
    const envelope_od = tlds.get_organizational_domain(ed)

    if (auth_od === envelope_od) return next()

    next(DENY, `Envelope domain '${envelope_od}' doesn't match AUTH domain '${auth_od}'`)
}
