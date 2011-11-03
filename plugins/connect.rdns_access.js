// connect.rdns_access plugin

exports.register = function() {
    var i;
    var config = this.config.get('connect.rdns_access.ini');
    this.wl = this.config.get('connect.rdns_access.whitelist', 'list');
    this.bl = this.config.get('connect.rdns_access.blacklist', 'list');
    this.deny_msg = config.general && (config.general['deny_msg'] ||
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

    this.register_hook('connect', 'rdns_access');
}

exports.rdns_access = function(next, connection) {
    var plugin = this;

    // IP whitelist checks
    if (connection.remote_ip) {
        plugin.logdebug('checking ' + connection.remote_ip +
            ' against connect.rdns_access.whitelist');

        if (_in_whitelist(plugin, connection.remote_ip)) {
            plugin.logdebug("Allowing " + connection.remote_ip);
            return next();
        }
    }

    // hostname whitelist checks
    if (connection.remote_host) {
        plugin.logdebug('checking ' + connection.remote_host +
            ' against connect.rdns_access.whitelist');

        if (_in_whitelist(plugin, connection.remote_host.toLowerCase())) {
            plugin.logdebug("Allowing " + connection.remote_host);
            return next();
        }
    }

    // IP blacklist checks
    if (connection.remote_ip) {
        plugin.logdebug('checking ' + connection.remote_ip +
            ' against connect.rdns_access.blacklist');

        if (_in_blacklist(plugin, connection.remote_ip)) {
            plugin.logdebug("Rejecting, matched: " + connection.remote_ip);
            return next(DENY, connection.remote_host.toLowerCase() + ' [' +
                connection.remote_ip + '] ' + plugin.deny_msg);
        }
    }

    // hostname blacklist checks
    if (connection.remote_host) {
        plugin.logdebug('checking ' + connection.remote_host +
            ' against connect.rdns_access.blacklist');

        if (_in_blacklist(plugin, connection.remote_host.toLowerCase())) {
            plugin.logdebug("Rejecting, matched: " + connection.remote_host);
            return next(DENY, connection.remote_host.toLowerCase() + ' [' +
                connection.remote_ip + '] ' + plugin.deny_msg);
        }
    }

    return next();
}

function _in_whitelist(plugin, host) {
    var i;
    for (i in plugin.wl) {
        plugin.logdebug('checking ' + host + ' against ' + plugin.wl[i]);

        if (plugin.wl[i].toLowerCase() === host) {
            return 1;
        }
    }

    if (plugin.wlregex) {
        plugin.logdebug('checking ' + host + ' against ' +
            plugin.wlregex.source);

        if (host.match(plugin.wlregex)) {
            return 1;
        }
    }

    return 0;
}

function _in_blacklist(plugin, host) {
    var i;
    for (i in plugin.bl) {
        plugin.logdebug('checking ' + host + ' against ' + plugin.bl[i]);

        if (plugin.bl[i].toLowerCase() === host) {
            return 1;
        }
    }

    if (plugin.blregex) {
        plugin.logdebug('checking ' + host + ' against ' +
            plugin.blregex.source);

        if (host.match(plugin.blregex)) {
            return 1;
        }
    }

    return 0;
}
