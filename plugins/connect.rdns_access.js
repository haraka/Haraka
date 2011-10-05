// connect.rdns_access plugin

exports.register = function() {
    var i;
    var config = this.config.get('connect.rdns_access.ini', 'ini');
    this.wl_alternation = '';
    this.bl_alternation = '';
    this.wl = this.config.get('connect.rdns_access.whitelist', 'list');
    this.bl = this.config.get('connect.rdns_access.blacklist', 'list');
    this.deny_msg = config.general && (config.general['deny_msg'] ||
        'Connection rejected.');
    var whitelist_regex =
        this.config.get('connect.rdns_access.whitelist_regex', 'list');
    var blacklist_regex =
        this.config.get('connect.rdns_access.blacklist_regex', 'list');

    for (i in whitelist_regex) {
        this.wl_alternation += whitelist_regex[i] + '|';
    }

    if (this.wl_alternation.length) {
        this.wl_alternation = this.wl_alternation.slice(0, -1);
        this.wlregex = new RegExp ('^(?:' + this.wl_alternation + ')$', 'i');
    }

    for (i in blacklist_regex) {
        this.bl_alternation += blacklist_regex[i] + '|';
    }

    if (this.bl_alternation.length) {
        this.bl_alternation = this.bl_alternation.slice(0, -1);
        this.blregex = new RegExp ('^(?:' + this.bl_alternation + ')$', 'i');
    }

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
            plugin.loginfo("Rejecting, matched: " + connection.remote_ip);
            return next(DENY, plugin.deny_msg);
        }
    }

    // hostname blacklist checks
    if (connection.remote_host) {
        plugin.logdebug('checking ' + connection.remote_host +
            ' against connect.rdns_access.blacklist');

        if (_in_blacklist(plugin, connection.remote_host.toLowerCase())) {
            plugin.loginfo("Rejecting, matched: " + connection.remote_host);
            return next(DENY, plugin.deny_msg);
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

    if (plugin.wl_alternation.length) {
        plugin.logdebug('checking ' + host + ' against ' +
            '^(?:' + plugin.wl_alternation + ')$');

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

    if (plugin.bl_alternation.length) {
        plugin.logdebug('checking ' + host + ' against ' +
            '^(?:' + plugin.bl_alternation + ')$');

        if (host.match(plugin.blregex)) {
            return 1;
        }
    }

    return 0;
}
