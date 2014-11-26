// Prevent a user from sending their AUTH credentials
// This is a simple, primitive form of anti-phishing.

function escapeRegExp(str) {
  return str.replace(/[\-\[\]\/\{\}\(\)\*\+\?\.\\\^\$\|]/g, "\\$&");
}

exports.hook_data = function (next, connection) {
    if (connection.notes.auth_user && connection.notes.auth_passwd) {
        connection.transaction.parse_body = true;
    }
    return next();
}

exports.hook_data_post = function (next, connection) {
    if (!(connection.notes.auth_user && connection.notes.auth_passwd)) {
        return next();
    }

    var user = connection.notes.auth_user;
    var domain;
    var idx;
    if ((idx = user.indexOf('@'))) {
        // If the username is qualified (e.g. user@domain.com)
        // then we make the @domain.com part optional in the regexp.
        domain = user.substr(idx);
        user = user.substr(0, idx);
    }
    var passwd        = connection.notes.auth_passwd;
    var bound_regexp  = "(?:\\b|\\B)";
    var passwd_regexp = new RegExp(bound_regexp + escapeRegExp(passwd) + bound_regexp, 'm');
    var user_regexp   = new RegExp(bound_regexp + 
                                   escapeRegExp(user) + 
                                   (domain ? '(?:' + escapeRegExp(domain) + ')?' : '') + 
                                   bound_regexp, 'im');

    if (look_for_credentials(user_regexp, passwd_regexp, connection.transaction.body)) {
        return next(DENY, "Credential leak detected: never give out your username/password to anyone!");
    }

    return next();
}

function look_for_credentials (user_regexp, passwd_regexp, body) {
    if (user_regexp.test(body.bodytext) && passwd_regexp.test(body.bodytext)) {
       return true;
    }

    // Check all child parts
    for (var i=0,l=body.children.length; i < l; i++) {
        if (look_for_credentials(user_regexp, passwd_regexp, body.children[i])) {
            return true;
        }
    }

    return false;
}
