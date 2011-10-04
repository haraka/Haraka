// connect.rdns_access plugin

exports.register = function() {
    var config       = this.config.get('connect.rdns_access.ini', 'ini');
    this.wl = this.config.get('connect.rdns_access.whitelist', 'list');
    this.bl = this.config.get('connect.rdns_access.blacklist', 'list');
    this.wlregex =
      this.config.get('connect.rdns_access.whitelist_regex', 'list');
    this.blregex =
      this.config.get('connect.rdns_access.blacklist_regex', 'list');
    this.deny_msg    = config.general && (config.general['deny_msg'] ||
      'Connection rejected.');


    this.register_hook('connect', 'rdns_access');
}

exports.rdns_access = function(next, connection) {
    var plugin = this;

    // IP whitelist checks
    if (connection.remote_ip) {
        plugin.logdebug('checking ' + connection.remote_ip +
            ' against connect.rdns_access.whitelist');

        if (_in_whitelist(plugin, connection.remote_ip.toLowerCase())) {
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

        if (_in_blacklist(plugin, connection.remote_ip.toLowerCase())) {
            plugin.logdebug("Rejecting " + connection.remote_ip);
            return next(DENY, plugin.deny_msg);
        }
    }

    // hostname blacklist checks
    if (connection.remote_host) {
        plugin.logdebug('checking ' + connection.remote_host +
            ' against connect.rdns_access.blacklist');

        if (_in_blacklist(plugin, connection.remote_host.toLowerCase())) {
            plugin.logdebug("Rejecting " + connection.remote_host);
            return next(DENY, plugin.deny_msg);
        }
    }
}

function _in_whitelist(plugin, host) {
    var i;
    for (i in plugin.wl) {
        plugin.logdebug("checking " + host + " against " + plugin.wl[i]);

        if (plugin.wl[i].toLowerCase() === host) {
            return 1;
        }
    }

    for (i in plugin.wlregex) {
        plugin.logdebug("checking " + host + " against " +
            plugin.wlregex[i]);

        var regex = new RegExp ('^' + plugin.wlregex[i] + '$', 'i');

        if (host.match(regex)) {
            return 1;
        }
    }

    return 0;
}

function _in_blacklist(plugin, host) {
    var i;
    for (i in plugin.bl) {
        plugin.logdebug("checking " + host + " against " + plugin.bl[i]);

        if (plugin.bl[i].toLowerCase() === host) {
            return 1;
        }
    }

    for (i in plugin.blregex) {
        plugin.logdebug("checking " + host + " against " +
            plugin.blregex[i]);

        var regex = new RegExp ('^' + plugin.blregex[i] + '$', 'i');

        if (host.match(regex)) {
            return 1;
        }
    }

    return 0;
}
