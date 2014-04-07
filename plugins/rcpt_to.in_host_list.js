// Check RCPT TO domain is in host list

exports.register = function() {
    var plugin = this;

    var load_config = function () {
        plugin.cfg.host_list = plugin.config.get('host_list', 'list', load_config);
        var regexes = plugin.config.get('host_list_regex', 'list', load_config);
        if (regexes.length) {
            plugin.cfg.regex = new RegExp ('^(?:' + regexes.join('|') + ')$', 'i');
        }
    };
    load_config();
};

exports.hook_mail = function(next, connection, params) {
    var plugin = this;
    if (!connection.relaying) {
        return next();
    }

    var mail_from = params[0];
    // Check for MAIL FROM without an @ first - ignore those here
    if (!mail_from.host) {
        connection.transaction.results.add(plugin, {skip: 'in_host_list(!host)'});
        return next();
    }

    connection.logdebug(plugin, "Checking if " + mail_from + " host is in host_lists");
    var domain = mail_from.host.toLowerCase();

    if (plugin.in_host_list(connection, domain)) {
        return next();
    }
    if (plugin.in_host_regex(connection, domain)) { return next(); }

    connection.transaction.results.add(plugin, {fail: 'in_host_list'});
    return next(DENY, "You are not allowed to send mail from that domain");
};

exports.hook_rcpt = function(next, connection, params) {
    var plugin = this;
    if (connection.relaying) { return next(); }

    var rcpt = params[0];
    // Check for RCPT TO without an @ first - ignore those here
    if (!rcpt.host) {
        return next();
    }

    connection.logdebug(plugin, "Checking if " + rcpt + " host is in host_lists");
    var domain = rcpt.host.toLowerCase();

    if (plugin.in_host_list(connection, domain)) { return next(OK); }
    if (plugin.in_host_regex(connection, domain)) { return next(OK); }

    connection.transaction.results.add(plugin, {fail: 'in_host_list'});
    return next();
};

exports.in_host_regex = function (connection, domain) {
    var plugin = this;
    if (!plugin.cfg.regex) { return false; }

    connection.logdebug(plugin, "checking " + domain + " against regexp " + plugin.cfg.regex.source);

    // regex matches
    if (plugin.cfg.regex.test(domain)) {
        connection.transaction.results.add(plugin, {pass: 'in_host_list'});
        return true;
    }
    return false;
};

exports.in_host_list = function (connection, domain) {
    var plugin = this;

    for (var i in plugin.cfg.host_list) {
        connection.logdebug(plugin, "checking " + domain + " against " + plugin.cfg.host_list[i]);

        // normal matches
        if (plugin.cfg.host_list[i].toLowerCase() === domain) {
            connection.transaction.results.add(plugin, {pass: 'in_host_list'});
            return true;
        }
    }
    return false;
};
