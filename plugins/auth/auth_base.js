// Base authentication plugin.
// This cannot be used on its own. You need to inherit from it.
// See plugins/auth/flat_file.js for an example.

var crypto = require('crypto');
var utils = require('./utils');
var AUTH_COMMAND = 'AUTH';
var AUTH_METHOD_CRAM_MD5 = 'CRAM-MD5';
var AUTH_METHOD_PLAIN = 'PLAIN';
var AUTH_METHOD_LOGIN = 'LOGIN';
var LOGIN_STRING1 = 'VXNlcm5hbWU6'; //UserLogin: base64 coded
var LOGIN_STRING2 = 'UGFzc3dvcmQ6'; //Password: base64 coded

exports.hook_capabilities = function (next, connection) {
    // Don't offer AUTH capabilities unless session is encrypted
    if (!connection.using_tls) { return next(); }

    var methods = [ 'PLAIN', 'LOGIN', 'CRAM-MD5' ];
    connection.capabilities.push('AUTH ' + methods.join(' '));
    connection.notes.allowed_auth_methods = methods;
    next();
};

// Override this at a minimum. Run cb(passwd) to provide a password.
exports.get_plain_passwd = function (user, cb) {
    return cb();
};

exports.hook_unrecognized_command = function (next, connection, params) {
    var plugin = this;
    if(params[0].toUpperCase() === AUTH_COMMAND && params[1]) {
        return plugin.select_auth_method(next, connection,
                params.slice(1).join(' '));
    }
    if (!connection.notes.authenticating) { return next(); }

    var am = connection.notes.auth_method;
    if (am === AUTH_METHOD_CRAM_MD5 && connection.notes.auth_ticket) {
        return plugin.auth_cram_md5(next, connection, params);
    }
    if (am === AUTH_METHOD_LOGIN) {
        return plugin.auth_login(next, connection, params);
    }
    if (am === AUTH_METHOD_PLAIN) {
        return plugin.auth_plain(next, connection, params);
    }
    return next();
};

exports.check_plain_passwd = function (connection, user, passwd, cb) {
    this.get_plain_passwd(user, function (plain_pw) {
        if (plain_pw === null  ) { return cb(false); }
        if (plain_pw !== passwd) { return cb(false); }
        return cb(true);
    });
};

exports.check_cram_md5_passwd = function (connection, user, passwd, cb) {
    this.get_plain_passwd(user, function (plain_pw) {
        if (plain_pw == null) {
            return cb(false);
        }

        var hmac = crypto.createHmac('md5', plain_pw);
            hmac.update(connection.notes.auth_ticket);

        if (hmac.digest('hex') === passwd) {
            return cb(true);
        }
        return cb(false);
    });
};

exports.check_user = function (next, connection, credentials, method) {
    var plugin = this;
    connection.notes.authenticating = false;
    if (!(credentials[0] && credentials[1])) {
        connection.respond(504, "Invalid AUTH string", function () {
            connection.reset_transaction(function () {
                return next(OK);
            });
        });
        return;
    }

    var passwd_ok = function (valid) {
        if (valid) {
            connection.relaying = true;
            connection.results.add({name:'relay'}, {pass: 'auth'});
            connection.results.add(plugin, {pass: method});
            connection.respond(235, "Authentication successful", function () {
                connection.authheader = "(authenticated bits=0)\n";
                connection.auth_results('auth=pass (' +
                            method.toLowerCase() + ')' );
                connection.notes.auth_user = credentials[0];
                connection.notes.auth_passwd = credentials[1];
                return next(OK);
            });
            return;
        }

        if (!connection.notes.auth_fails) {
            connection.notes.auth_fails = 0;
        }
        connection.notes.auth_fails++;
        connection.results.add(plugin, {fail: method});

        connection.notes.auth_login_userlogin = null;
        connection.notes.auth_login_asked_login = false;

        var delay = Math.pow(2, connection.notes.auth_fails - 1);
        if (plugin.timeout && delay >= plugin.timeout) {
            delay = plugin.timeout - 1;
        }
        connection.lognotice(plugin, 'delaying for ' + delay + ' seconds');
        // here we include the username, as shown in RFC 5451 example
        connection.auth_results('auth=fail (' + method.toLowerCase() +
                    ') smtp.auth='+ credentials[0]);
        setTimeout(function () {
            connection.respond(535, "Authentication failed", function () {
                connection.reset_transaction(function () {
                    return next(OK);
                });
            });
        }, delay * 1000);
    };

    if (method === AUTH_METHOD_PLAIN || method === AUTH_METHOD_LOGIN) {
        plugin.check_plain_passwd(connection, credentials[0], credentials[1],
                passwd_ok);
    }
    else if (method === AUTH_METHOD_CRAM_MD5) {
        plugin.check_cram_md5_passwd(connection, credentials[0], credentials[1],
                passwd_ok);
    }
};

exports.select_auth_method = function(next, connection, method) {
    var split = method.split(/\s+/);
    method = split.shift().toUpperCase();
    if (!connection.notes.allowed_auth_methods) return next();
    if (connection.notes.allowed_auth_methods.indexOf(method) === -1) {
        return next();
    }

    connection.notes.authenticating = true;
    connection.notes.auth_method = method;

    if (method === AUTH_METHOD_PLAIN) {
        return this.auth_plain(next, connection, split);
    }
    if (method === AUTH_METHOD_LOGIN) {
        return this.auth_login(next, connection, split);
    }
    if (method === AUTH_METHOD_CRAM_MD5) {
        return this.auth_cram_md5(next, connection);
    }
};

exports.auth_plain = function(next, connection, params) {
    var plugin = this;
    if (!params || !params.length) {
        connection.respond(334, ' ', function () {
            return next(OK);
        });
        return;
    }

    var credentials = utils.unbase64(params[0]).split(/\0/);
    credentials.shift();  // Discard authid
    return plugin.check_user(next, connection, credentials, AUTH_METHOD_PLAIN);
};

exports.auth_login = function(next, connection, params) {
    var plugin = this;
    if ((!connection.notes.auth_login_asked_login && params[0]) ||
        ( connection.notes.auth_login_asked_login &&
         !connection.notes.auth_login_userlogin))
    {
        var login = utils.unbase64(params[0]);
        connection.respond(334, LOGIN_STRING2, function () {
            connection.notes.auth_login_userlogin = login;
            connection.notes.auth_login_asked_login = true;
            return next(OK);
        });
        return;
    }

    if (connection.notes.auth_login_userlogin) {
        var credentials = [
		        connection.notes.auth_login_userlogin,
		        utils.unbase64(params[0])
	        ];
        return plugin.check_user(next, connection, credentials,
                AUTH_METHOD_LOGIN);
    }

    connection.respond(334, LOGIN_STRING1, function () {
        connection.notes.auth_login_asked_login = true;
        return next(OK);
    });
};

exports.auth_cram_md5 = function(next, connection, params) {
    var plugin = this;
    if (params) {
        var credentials = utils.unbase64(params[0]).split(' ');
        return plugin.check_user(next, connection, credentials,
                AUTH_METHOD_CRAM_MD5);
    }

    var ticket = '<' + plugin.hexi(Math.floor(Math.random() * 1000000)) + '.' +
                plugin.hexi(Date.now()) + '@' + plugin.config.get('me') + '>';

    connection.loginfo(plugin, "ticket: " + ticket);
    connection.respond(334, utils.base64(ticket), function () {
        connection.notes.auth_ticket = ticket;
        return next(OK);
    });
};

exports.hexi = function (number) {
    return String(Math.abs(parseInt(number)).toString(16));
};
