// mail_from.access plugin

exports.register = function() {
    this.inherits('note');
    var i;
    var config = this.config.get('mail_from.access.ini');
    this.wl = this.config.get('mail_from.access.whitelist', 'list');
    this.bl = this.config.get('mail_from.access.blacklist', 'list');
    this.deny_msg = config.general && (config.general['deny_msg'] ||
        'Connection rejected.');
    var white_regex =
        this.config.get('mail_from.access.whitelist_regex', 'list');
    var black_regex =
        this.config.get('mail_from.access.blacklist_regex', 'list');

    if (white_regex.length) {
        this.wlregex = new RegExp('^(?:' + white_regex.join('|') + ')$', 'i');
    }

    if (black_regex.length) {
        this.blregex = new RegExp('^(?:' + black_regex.join('|') + ')$', 'i');
    }

    this.register_hook('mail', 'mail_from_access');
}

exports.mail_from_access = function(next, connection, params) {
    var plugin = this;
    plugin.note_init({conn: connection, plugin: this, txn: true});
    var mail_from = params[0].address();

    if (!mail_from) {
        this.note({conn: connection, skip: 'null sender'});
        return next();
    }

    // address whitelist checks
    connection.logdebug(plugin, 'checking ' + mail_from +
        ' against mail_from.access.whitelist');

    if (_in_whitelist(connection, plugin, mail_from)) {
        // connection.logdebug(plugin, "Allowing " + mail_from);
        this.note({conn: connection, pass: 'whitelisted', emit: true});
        return next();
    }

    // address blacklist checks
    connection.logdebug(plugin, 'checking ' + mail_from +
        ' against mail_from.access.blacklist');

    if (_in_blacklist(connection, plugin, mail_from)) {
        // connection.logdebug(plugin, "Rejecting, matched: " + mail_from);
        this.note({conn: connection, fail: 'blacklisted', emit: true});
        return next(DENY, mail_from + ' ' + plugin.deny_msg);
    }

    this.note({conn: connection, pass: 'unlisted', emit: true});
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
