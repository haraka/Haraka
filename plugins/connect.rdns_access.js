// connect.rdns_access plugin
//
// NOTICE: this plugin is deprecated. See 'haraka -h access' to upgrade

exports.register = function() {
    var config = this.config.get('connect.rdns_access.ini');
    this.wl = this.config.get('connect.rdns_access.whitelist', 'list');
    this.bl = this.config.get('connect.rdns_access.blacklist', 'list');
    this.deny_msg = config.general && (config.general.deny_msg ||
        'Connection rejected.');
    var white_regex =
        this.config.get('connect.rdns_access.whitelist_regex', 'list');
    var black_regex =
        this.config.get('connect.rdns_access.blacklist_regex', 'list');

    if (white_regex.length) {
        this.wlregex = new RegExp('^(?:' + white_regex.join('|') + ')$', 'i');
    }

    if (black_regex.length) {
        this.blregex = new RegExp('^(?:' + black_regex.join('|') + ')$', 'i');
    }

    this.logerror(this, "plugin deprecated. see 'haraka -h access' for upgrade instructions");

    this.register_hook('connect', 'rdns_access');
};

exports.rdns_access = function(next, connection) {
    var plugin = this;

    // IP whitelist checks
    if (connection.remote.ip) {
        connection.logdebug(plugin, 'checking ' + connection.remote.ip +
            ' against connect.rdns_access.whitelist');

        if (_in_whitelist(connection, plugin, connection.remote.ip)) {
            connection.logdebug(plugin, "Allowing " + connection.remote.ip);
            connection.notes.rdns_access = 'white';
            return next();
        }
    }

    // hostname whitelist checks
    if (connection.remote.host) {
        connection.logdebug(plugin, 'checking ' + connection.remote.host +
            ' against connect.rdns_access.whitelist');

        if (_in_whitelist(connection, plugin, connection.remote.host.toLowerCase())) {
            connection.logdebug(plugin, "Allowing " + connection.remote.host);
            connection.notes.rdns_access = 'white';
            return next();
        }
    }

    // IP blacklist checks
    if (connection.remote.ip) {
        connection.logdebug(plugin, 'checking ' + connection.remote.ip +
            ' against connect.rdns_access.blacklist');

        if (_in_blacklist(connection, plugin, connection.remote.ip)) {
            connection.logdebug(plugin, "Rejecting, matched: " +
                connection.remote.ip);
            connection.notes.rdns_access = 'black';
            return next(DENYDISCONNECT, connection.remote.host.toLowerCase() +
                ' [' + connection.remote.ip + '] ' + plugin.deny_msg);
        }
    }

    // hostname blacklist checks
    if (connection.remote.host) {
        connection.logdebug(plugin, 'checking ' + connection.remote.host +
            ' against connect.rdns_access.blacklist');

        if (_in_blacklist(connection, plugin, connection.remote.host.toLowerCase())) {
            connection.logdebug(plugin, "Rejecting, matched: " +
               connection.remote.host);
            connection.notes.rdns_access = 'black';
            return next(DENYDISCONNECT, connection.remote.host.toLowerCase() +
                ' [' + connection.remote.ip + '] ' + plugin.deny_msg);
        }
    }

    return next();
}

function _in_whitelist(connection, plugin, host) {
    var i;
    for (i in plugin.wl) {
        connection.logdebug(plugin, 'checking ' + host + ' against ' +
            plugin.wl[i]);

        if (plugin.wl[i].toLowerCase() === host) {
            return 1;
        }
    }

    if (plugin.wlregex) {
        connection.logdebug(plugin, 'checking ' + host + ' against ' +
            plugin.wlregex.source);

        if (host.match(plugin.wlregex)) {
            return 1;
        }
    }

    return 0;
}

function _in_blacklist(connection, plugin, host) {
    var i;
    for (i in plugin.bl) {
        connection.logdebug(plugin, 'checking ' + host + ' against ' +
            plugin.bl[i]);

        if (plugin.bl[i].toLowerCase() === host) {
            return 1;
        }
    }

    if (plugin.blregex) {
        connection.logdebug(plugin, 'checking ' + host + ' against ' +
            plugin.blregex.source);

        if (host.match(plugin.blregex)) {
            return 1;
        }
    }

    return 0;
}
