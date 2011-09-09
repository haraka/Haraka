// Auth against a flat file

var crypto = require('crypto');

exports.hook_capabilities = function (next, connection) {
    connection.capabilities.push('AUTH LOGIN CRAM-MD5');
    next();
}

exports.hook_unrecognized_command = function (next, connection, params) {
    this.loginfo(params);
    if (connection.notes.auth_flat_file_ticket) {
        var credentials = unbase64(params[0]).split(' ');
        return this.check_user(next, connection, credentials, 'MD5');
    }else if (connection.notes.auth_login_flat_file_ticket && !connection.notes.auth_login_flat_file_login) {
        var login = unbase64(params[0]);
        connection.respond(334, 'UGFzc3dvcmQ6');
        connection.notes.auth_login_flat_file_login = login;
        return next(OK);
    }else if (connection.notes.auth_login_flat_file_ticket && connection.notes.auth_login_flat_file_login) {
        var pass = unbase64(params[0]),
    	    credentials = [
		connection.notes.auth_login_flat_file_login,
		pass
	    ];
        return this.check_user_plain(next, connection, [connection.notes.auth_login_flat_file_login, pass]);
    }
    else if (params[0] === 'AUTH' && params[1] === 'CRAM-MD5') {
        var ticket = '<' + hexi(Math.floor(Math.random() * 1000000)) + '.' +
                    hexi(Date.now()) + '@' + this.config.get('me') + '>';
        this.loginfo("ticket: " + ticket);
        connection.respond(334, base64(ticket));
        connection.notes.auth_flat_file_ticket = ticket;
        return next(OK);
    }
    else if (params[0] === 'AUTH' && params[1] === 'LOGIN') {
        connection.respond(334, 'VXNlcm5hbWU6');
        connection.notes.auth_login_flat_file_ticket = 'UserName:';
        return next(OK);
    }
    return next();
}

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
	hmac_pw;
    if(method === 'PLAIN') {
	hmac_pw = clear_pw;
    } else if(method === "MD5") {
	var hmac = crypto.createHmac('md5', clear_pw);
	hmac.update(connection.notes.auth_flat_file_ticket);
	hmac_pw = hmac.digest('hex');
    }
    
    this.loginfo("comparing " + hmac_pw + ' to ' + credentials[1]);
    
    if (hmac_pw === credentials[1]) {
        connection.relaying = 1;
        connection.respond(235, "Authentication successful");
    }
    else {
        connection.respond(535, "Authentication failed");
        connection.reset_transaction();
    }
    return next(OK);
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