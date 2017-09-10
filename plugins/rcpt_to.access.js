'use strict';
// rcpt_to.access plugin

exports.register = function () {
    const config = this.config.get('rcpt_to.access.ini');
    this.wl = this.config.get('rcpt_to.access.whitelist', 'list');
    this.bl = this.config.get('rcpt_to.access.blacklist', 'list');
    this.deny_msg = config.general && (config.general.deny_msg ||
        'Connection rejected.');
    const white_regex =
        this.config.get('rcpt_to.access.whitelist_regex', 'list');
    const black_regex =
        this.config.get('rcpt_to.access.blacklist_regex', 'list');

    if (white_regex.length) {
        this.wlregex = new RegExp('^(?:' + white_regex.join('|') + ')$', 'i');
    }

    if (black_regex.length) {
        this.blregex = new RegExp('^(?:' + black_regex.join('|') + ')$', 'i');
    }

    this.logerror(this, "plugin deprecated. see 'haraka -h access' for upgrade instructions");
    this.register_hook('rcpt', 'rcpt_to_access');
};

exports.rcpt_to_access = function (next, connection, params) {
    const plugin = this;
    const rcpt_to = params[0].address();

    // address whitelist checks
    if (!rcpt_to) {
        connection.transaction.results.add(plugin, {skip: 'null rcpt', emit: true});
        return next();
    }

    connection.logdebug(plugin, 'checking ' + rcpt_to +
        ' against rcpt_to.access.whitelist');

    if (_in_whitelist(connection, plugin, rcpt_to)) {
        connection.logdebug(plugin, "Allowing " + rcpt_to);
        connection.transaction.results.add(plugin, {pass: 'whitelisted', emit: true});
        return next();
    }

    // address blacklist checks
    connection.logdebug(plugin, 'checking ' + rcpt_to +
        ' against rcpt_to.access.blacklist');

    if (_in_blacklist(connection, plugin, rcpt_to)) {
        connection.logdebug(plugin, "Rejecting, matched: " + rcpt_to);
        connection.transaction.results.add(plugin, {fail: 'blacklisted', emit: true});
        return next(DENY, rcpt_to + ' ' + plugin.deny_msg);
    }

    connection.transaction.results.add(plugin, {pass: 'unlisted', emit: true});
    return next();
};

function _in_whitelist (connection, plugin, address) {
    let i;
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

function _in_blacklist (connection, plugin, address) {
    let i;
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
