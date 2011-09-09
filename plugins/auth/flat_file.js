// Auth against a flat file

var crypto = require('crypto');

exports.hook_capabilities = function (next, connection) {
    connection.capabilities.push('AUTH CRAM-MD5');
    next();
}

exports.hook_unrecognized_command = function (next, connection, params) {
    if (connection.notes.auth_flat_file_ticket) {
        var credentials = unbase64(params[0]).split(' ');
        return this.check_user(next, connection, credentials);
    }
    else if (params[0] === 'AUTH' && params[1] === 'CRAM-MD5') {
        var ticket = '<' + hexi(Math.floor(Math.random() * 1000000)) + '.' +
                    hexi(Date.now()) + '@' + this.config.get('me') + '>';
        this.loginfo("ticket: " + ticket);
        connection.respond(334, base64(ticket));
        connection.notes.auth_flat_file_ticket = ticket;
        return next(OK);
    }
    return next();
}

exports.check_user = function (next, connection, credentials) {
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
    
    var clear_pw = config.users[credentials[0]];
    
    var hmac = crypto.createHmac('md5', clear_pw);
    hmac.update(connection.notes.auth_flat_file_ticket);
    var hmac_pw = hmac.digest('hex');
    
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