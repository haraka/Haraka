// Base authentication plugin.
// This cannot be used on its own. You need to inherit from it.
// See plugins/auth/flat_file.js for an example.

var crypto = require('crypto');
var AUTH_COMMAND = 'AUTH';
var AUTH_METHOD_CRAM_MD5 = 'CRAM-MD5';
var AUTH_METHOD_PLAIN = 'PLAIN';
var AUTH_METHOD_LOGIN = 'LOGIN';
var LOGIN_STRING1 = 'VXNlcm5hbWU6'; //UserLogin: base64 coded
var LOGIN_STRING2 = 'UGFzc3dvcmQ6'; //Password: base64 coded

exports.hook_capabilities = function (next, connection) {
    // Don't offer AUTH capabilities by default unless session is encrypted
    if (connection.using_tls) {
        var methods = [ 'PLAIN', 'LOGIN', 'CRAM-MD5' ];
        connection.capabilities.push('AUTH ' + methods.join(' '));
        connection.notes.allowed_auth_methods = methods;
    }
    next();
}

// You need to override this at a minimum. Run cb(passwd) to provide a password.
exports.get_plain_passwd = function (user, cb) {
    return cb();
}

exports.hook_unrecognized_command = function (next, connection, params) {
    if(params[0].toUpperCase() === AUTH_COMMAND && params[1]) {
        return this.select_auth_method(next, connection, params.slice(1).join(' '));
    }
    else if (connection.notes.authenticating &&
             connection.notes.auth_method === AUTH_METHOD_CRAM_MD5 &&
             connection.notes.auth_ticket)
    {
        return this.auth_cram_md5(next, connection, params);
    }
    else if (connection.notes.authenticating &&
             connection.notes.auth_method === AUTH_METHOD_LOGIN)
    {
        return this.auth_login(next, connection, params);
    }
    else if (connection.notes.authenticating &&
             connection.notes.auth_method === AUTH_METHOD_PLAIN)
    {
        return this.auth_plain(next, connection, params);
    }
    return next();
}

exports.check_plain_passwd = function (connection, user, passwd, cb) {
    this.get_plain_passwd(user, function (plain_pw) {
        if (plain_pw === null) {
            return cb(false);
        }
        if (plain_pw === passwd) {
            return cb(true);
        }
        return cb(false);
    })
}

exports.check_cram_md5_passwd = function (ticket, user, passwd, cb) {
    this.get_plain_passwd(user, function (plain_pw) {
        if (plain_pw == null) {
            return cb(false);
        }
        
        var hmac = crypto.createHmac('md5', plain_pw);
        hmac.update(ticket);
        var hmac_pw = hmac.digest('hex');

        if (hmac_pw === passwd) {
            return cb(true);
        }
        return cb(false);
    })
}

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
            connection.relaying = 1;
            connection.results.add({name:'relay'}, {pass: 'auth'});
            connection.respond(235, "Authentication successful", function () {
                connection.authheader = "(authenticated bits=0)\n";
                connection.auth_results('auth=pass ('+method.toLowerCase()+')' );
                connection.notes.auth_user = credentials[0];
                return next(OK);
            });
        }
        else {
            if (!connection.notes.auth_fails) {
                connection.notes.auth_fails = 0;
            }
            connection.notes.auth_fails++;

            connection.notes.auth_login_userlogin = null;
            connection.notes.auth_login_asked_login = false;

            var delay = Math.pow(2, connection.notes.auth_fails - 1);
            if (plugin.timeout && delay >= plugin.timeout) { delay = plugin.timeout - 1 }
            connection.lognotice(plugin, 'delaying response for ' + delay + ' seconds');
            // here we include the username, as shown in RFC 5451 example
            connection.auth_results('auth=fail ('+method.toLowerCase()+') smtp.auth='+ credentials[0]);
            setTimeout(function () {
                connection.respond(535, "Authentication failed", function () {
                    connection.reset_transaction(function () {
                        return next(OK);
                    });
                });
            }, delay * 1000);
        }
    }

    if (method === AUTH_METHOD_PLAIN || method === AUTH_METHOD_LOGIN) {
        plugin.check_plain_passwd(connection, credentials[0], credentials[1], passwd_ok);
    }
    else if (method === AUTH_METHOD_CRAM_MD5) {
        plugin.check_cram_md5_passwd(connection.notes.auth_ticket, credentials[0], credentials[1], passwd_ok);
    }
}

exports.select_auth_method = function(next, connection, method) {
    var split = method.split(/\s+/);
    method = split.shift().toUpperCase();
    var params = split;
    if(connection.notes.allowed_auth_methods &&
       connection.notes.allowed_auth_methods.indexOf(method) !== -1)
    {
        connection.notes.authenticating = true;
        connection.notes.auth_method = method;
        if(method === AUTH_METHOD_PLAIN) {
            return this.auth_plain(next, connection, params);
        }
        else if(method === AUTH_METHOD_LOGIN) {
            return this.auth_login(next, connection, params);
        }
        else if( method === AUTH_METHOD_CRAM_MD5) {
            return this.auth_cram_md5(next, connection);
        }
    }
    return next();
}

exports.auth_plain = function(next, connection, params) {
    if (!params || (params && !params.length)) {
        connection.respond(334, ' ', function () {
            return next(OK);
        });
    }
    else { 
        var credentials = unbase64(params[0]).split(/\0/);
        credentials.shift();  // Discard authid
        return this.check_user(next, connection, credentials, AUTH_METHOD_PLAIN);
        return next();
    }
}

exports.auth_login = function(next, connection, params) {
    if ((!connection.notes.auth_login_asked_login && params[0]) ||
        (connection.notes.auth_login_asked_login && !connection.notes.auth_login_userlogin)) 
    {
        var login = unbase64(params[0]);
        connection.respond(334, LOGIN_STRING2, function () {
            connection.notes.auth_login_userlogin = login;
            connection.notes.auth_login_asked_login = true;
            return next(OK);
        });
        return;
    }
    else if (connection.notes.auth_login_userlogin) {
        var credentials = [
		        connection.notes.auth_login_userlogin,
		        unbase64(params[0])
	        ];
        return this.check_user(next, connection, credentials, AUTH_METHOD_LOGIN);
    }
    
    connection.respond(334, LOGIN_STRING1, function () {
        connection.notes.auth_login_asked_login = true;
        return next(OK);
    });
}

exports.auth_cram_md5 = function(next, connection, params) {
    if(params) {
        var credentials = unbase64(params[0]).split(' ');
        return this.check_user(next, connection, credentials, AUTH_METHOD_CRAM_MD5);
    }
    
    var ticket = '<' + hexi(Math.floor(Math.random() * 1000000)) + '.' +
                    hexi(Date.now()) + '@' + this.config.get('me') + '>';
    connection.loginfo(this, "ticket: " + ticket);
    connection.respond(334, base64(ticket), function () {
        connection.notes.auth_ticket = ticket;
        return next(OK);
    });
}

function hexi (number) {
    return String(Math.abs(parseInt(number)).toString(16));
}

function base64 (str) {
    var buffer = new Buffer(str, "UTF-8");
    return buffer.toString("base64");
}

function unbase64 (str) {
    var buffer = new Buffer(str, "base64");
    return buffer.toString("UTF-8");
}

exports.base64 = base64;
exports.unbase64 = unbase64;
