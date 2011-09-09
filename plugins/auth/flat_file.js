// Auth against a flat file

var crypto = require('crypto'),
    AUTH_COMMAND = 'AUTH',
    AUTH_METHOD_CRAM_MD5 = 'CRAM-MD5',
    AUTH_METHOD_LOGIN = 'LOGIN',
    LOGIN_STRING1 = 'VXNlcm5hbWU6', //UserLogin: base64 coded
    LOGIN_STRING2 = 'UGFzc3dvcmQ6'; //Password: base64 coded

exports.hook_capabilities = function (next, connection) {
    var config = this.config.get('auth_flat_file.ini', 'ini'),
	methods = (config.methods && config.methods.allowed ) ? config.methods.allowed.split(',') : null;
    if(methods.length > 0) {
	    connection.capabilities.push('AUTH ' + methods.join(' '));
        connection.notes.allowed_auth_methods = methods;
    }
    next();
};

exports.hook_unrecognized_command = function (next, connection, params) {
    if(params[0] === AUTH_COMMAND && params[1]) {
        return this.select_auth_method(next, connection, params[1]);
    } else if (connection.notes.auth_method === AUTH_METHOD_CRAM_MD5 && connection.notes.auth_flat_file_ticket) {
        return this.auth_cram_md5 (next, connection, params);
    } else if (connection.notes.auth_method === AUTH_METHOD_LOGIN) {
        return this.auth_login(next, connection, params);
    }
    return next();
};

exports.check_user = function (next, connection, credentials, method) {
    if (!(credentials[0] && credentials[1])) {
        connection.respond(504, "Invalid AUTH string");
        connection.reset_transaction();
        return next(OK);
    }
    
    var config = this.config.get('auth_flat_file.ini', 'ini');
    if (!config.users[credentials[0]]) {
        connection.respond(535, "Authentication failed for " + credentials[0]);
        connection.reset_transaction();
        return next(OK);
    }
    
    var clear_pw = config.users[credentials[0]],
	hmac_pw = clear_pw;

    if(method === AUTH_METHOD_CRAM_MD5) {
	    var hmac = crypto.createHmac('md5', clear_pw);
	    hmac.update(connection.notes.auth_flat_file_ticket);
	    hmac_pw = hmac.digest('hex');
    }
    
    this.loginfo("comparing " + hmac_pw + ' to ' + credentials[1]);
    
    if (hmac_pw === credentials[1]) {
        connection.relaying = 1;
        connection.respond(235, "Authentication successful");
        connection.authheader = "(authenticated bits=0)\n";
    }
    else {
        connection.respond(535, "Authentication failed");
        connection.reset_transaction();
    }
    return next(OK);
};

exports.select_auth_method = function(next, connection, method) {
    if(connection.notes.allowed_auth_methods.indexOf(method) !== -1) {
        connection.notes.auth_method = method;
        if(method === AUTH_METHOD_LOGIN) {
            return this.auth_login(next, connection);
        } else if( method === AUTH_METHOD_CRAM_MD5) {
            return this.auth_cram_md5(next, connection);
        }
    }
    return next();
};

exports.auth_login = function(next, connection, params) {
    if (connection.notes.auth_login_asked_login && !connection.notes.auth_login_userlogin) {
        var login = unbase64(params[0]);
        connection.respond(334, LOGIN_STRING2);
        connection.notes.auth_login_userlogin = login;
        return next(OK);
    }else if (connection.notes.auth_login_userlogin) {
        var credentials = [
		        connection.notes.auth_login_userlogin,
		        unbase64(params[0])
	        ];
        return this.check_user(next, connection, credentials, AUTH_METHOD_LOGIN);
    }
    
    connection.respond(334, LOGIN_STRING1);
    connection.notes.auth_login_asked_login = true;
    return next(OK);
};

exports.auth_cram_md5 = function(next, connection, params) {
    if(params) {
        var credentials = unbase64(params[0]).split(' ');
        return this.check_user(next, connection, credentials, AUTH_METHOD_CRAM_MD5);
    }
    
    var ticket = '<' + hexi(Math.floor(Math.random() * 1000000)) + '.' +
                    hexi(Date.now()) + '@' + this.config.get('me') + '>';
    this.loginfo("ticket: " + ticket);
    connection.respond(334, base64(ticket));
    connection.notes.auth_flat_file_ticket = ticket;
    return next(OK);
};

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
