// rcpt_to.access plugin

exports.register = function() {
    this.inherits('note');
    var i;
    var config = this.config.get('rcpt_to.access.ini');
    this.wl = this.config.get('rcpt_to.access.whitelist', 'list');
    this.bl = this.config.get('rcpt_to.access.blacklist', 'list');
    this.deny_msg = config.general && (config.general['deny_msg'] ||
        'Connection rejected.');
    var white_regex =
        this.config.get('rcpt_to.access.whitelist_regex', 'list');
    var black_regex =
        this.config.get('rcpt_to.access.blacklist_regex', 'list');

    if (white_regex.length) {
        this.wlregex = new RegExp('^(?:' + white_regex.join('|') + ')$', 'i');
    }

    if (black_regex.length) {
        this.blregex = new RegExp('^(?:' + black_regex.join('|') + ')$', 'i');
    }

    this.register_hook('rcpt', 'rcpt_to_access');
}

exports.rcpt_to_access = function(next, connection, params) {
    var plugin = this;
    var rcpt_to = params[0].address();
    plugin.note_init({conn: connection, plugin: this, txn: true});

    // address whitelist checks
    if (!rcpt_to) {
        plugin.note({conn: connection, skip: 'null rcpt'});
        return next();
    }

    connection.logdebug(plugin, 'checking ' + rcpt_to +
        ' against rcpt_to.access.whitelist');

    if (_in_whitelist(connection, plugin, rcpt_to)) {
        connection.logdebug(plugin, "Allowing " + rcpt_to);
        plugin.note({conn: connection, pass: 'whitelisted'});
        return next();
    }

    // address blacklist checks
    connection.logdebug(plugin, 'checking ' + rcpt_to +
        ' against rcpt_to.access.blacklist');

    if (_in_blacklist(connection, plugin, rcpt_to)) {
        connection.logdebug(plugin, "Rejecting, matched: " + rcpt_to);
        plugin.note({conn: connection, pass: 'blacklisted'});
        return next(DENY, rcpt_to + ' ' + plugin.deny_msg);
    }

    plugin.note({conn: connection, pass: 'unlisted'});
    return next();
}

function _in_whitelist(connection, plugin, address) {
    var i;
    for (i in plugin.wl) {
        connection.logdebug(plugin, 'checking ' + address + ' against ' +
            plugin.wl[i]);

        if (plugin.wl[i] === address) {
            return true;
        }
    }

    if (plugin.wlregex) {
        connection.logdebug(plugin, 'checking ' + address + ' against ' +
            plugin.wlregex.source);

        if (address.match(plugin.wlregex)) {
            return true;
        }
    }

    return false;
}

function _in_blacklist(connection, plugin, address) {
    var i;
    for (i in plugin.bl) {
        connection.logdebug(plugin, 'checking ' + address + ' against ' +
            plugin.bl[i]);

        if (plugin.bl[i] === address) {
            return true;
        }
    }

    if (plugin.blregex) {
        connection.logdebug(plugin, 'checking ' + address + ' against ' +
            plugin.blregex.source);

        if (address.match(plugin.blregex)) {
            return true;
        }
    }

    return false;
}
