// Check RCPT TO domain is in host list

// Previous versions of this plugin (Haraka <= 2.4.0) did not account for
// relaying users. This plugin now permits relaying clients to send if
// the message is destined to or originating from a local domain.
//
// The mail hook always checks the MAIL FROM address and when detected, sets
// connection.transaction.notes.local_sender=true. During RCPT TO, if relaying
// is enabled and the sending domain is local, the receipt is OK.

exports.register = function() {
    var plugin = this;

    var load_host_list = function () {
        plugin.loginfo(plugin, "loading host_list");
        plugin.host_list = plugin.config.get('host_list', 'list', load_host_list);
    };
    load_host_list();

    var load_host_list_regex = function () {
        plugin.loginfo(plugin, "loading host_list_regex");
        plugin.host_list_regex = plugin.config.get('host_list_regex', 'list', load_host_list_regex);
        plugin.hl_re = new RegExp ('^(?:' + plugin.host_list_regex.join('|') + ')$', 'i');
    };
    load_host_list_regex();
};

exports.hook_mail = function(next, connection, params) {
    var plugin = this;
    var txn = connection.transaction;
    if (!txn) { return; }

    var email = params[0].address();
    if (!email) {
        txn.results.add(plugin, {skip: 'mail_from.null', emit: true});
        return next();
    }

    var domain = params[0].host.toLowerCase();

    if (plugin.in_host_list(domain)) {
        txn.results.add(plugin, {pass: 'mail_from'});
        txn.notes.local_sender = true;
        return next();
    }

    if (plugin.in_host_regex(domain)) {
        txn.results.add(plugin, {pass: 'mail_from'});
        txn.notes.local_sender = true;
        return next();
    }

    txn.results.add(plugin, {msg: 'mail_from!local'});
    return next();
};

exports.hook_rcpt = function(next, connection, params) {
    var plugin = this;
    var txn = connection.transaction;
    if (!txn) { return; }

    var rcpt = params[0];
    // Check for RCPT TO without an @ first - ignore those here
    if (!rcpt.host) {
        txn.results.add(plugin, {fail: 'rcpt!domain'});
        return next();
    }

    connection.logdebug(plugin, "Checking if " + rcpt + " host is in host_list");

    var domain = rcpt.host.toLowerCase();

    if (plugin.in_host_list(domain)) {
        txn.results.add(plugin, {pass: 'rcpt_to'});
        return next(OK);
    }

    if (plugin.in_host_regex(domain)) {
        txn.results.add(plugin, {pass: 'rcpt_to'});
        return next(OK);
    }

    // in this case, a client with relaying privileges is sending FROM a local
    // domain. For them, any RCPT address is accepted.
    if (connection.relaying && txn.notes.local_sender) {
        txn.results.add(plugin, {pass: 'relaying local_sender'});
        return next(OK);
    }

    // the MAIL FROM domain is not local and neither is the RCPT TO
    // Another RCPT plugin may yet vouch for this recipient.
    txn.results.add(plugin, {msg: 'rcpt!local'});
    return next();
};

exports.in_host_list = function (domain) {
    var plugin = this;
    for (var i in plugin.host_list) {
        plugin.logdebug("checking " + domain + " against " + plugin.host_list[i]);

        // normal matches
        if (plugin.host_list[i].toLowerCase() === domain) {
            return true;
        }
    }
    return false;
};

exports.in_host_regex = function (domain) {
    var plugin = this;
    if (!plugin.host_list_regex) return false;
    if (!plugin.host_list_regex.length) return false;

    plugin.logdebug("checking " + domain + " against regexp " + plugin.hl_re.source);

    if (!plugin.hl_re.test(domain)) { return false; }
    return true;
};
