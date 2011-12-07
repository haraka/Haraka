// Check RCPT TO domain is in host list

exports.hook_rcpt = function(next, connection, params) {
    var rcpt = params[0];
    // Check for RCPT TO without an @ first - ignore those here
    if (!rcpt.host) {
        return next();
    }
    
    connection.loginfo(this, "Checking if " + rcpt + " host is in host_lists");
    
    var domain          = rcpt.host.toLowerCase();
    var host_list       = this.config.get('host_list', 'list');
    var host_list_regex = this.config.get('host_list_regex', 'list');

    var i = 0;
    for (i in host_list) {
        connection.logdebug(this, "checking " + domain + " against " + host_list[i]);

        // normal matches
        if (host_list[i].toLowerCase() === domain) {
            connection.logdebug(this, "Allowing " + domain);
            return next(OK);
        }
    }

    if (host_list_regex.length) {
        var regex = new RegExp ('^(?:' + host_list_regex.join('|') + ')$', 'i');

        connection.logdebug(this, "checking " + domain + " against regexp " + regex.source);

        // regex matches
        if (domain.match(regex)) {
            connection.logdebug(this, "Allowing " + domain);
            return next(OK);
        }
    }
    
    next();
}
