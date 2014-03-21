// relay_acl

// documentation via: haraka -h plugins/relay_acl

var ipaddr = require('ipaddr.js');

exports.register = function() {
    this.register_hook('lookup_rdns', 'refresh_config');
    this.register_hook('connect',     'relay_acl');
    this.register_hook('rcpt',        'relay_dest_domains');
};

exports.refresh_config = function() {
    this.cfg = this.config.get('relay_dest_domains.ini', 'ini');
    this.acl_allow = this.config.get('relay_acl_allow', 'list');
};

exports.relay_acl = function (next, connection, params) {
    connection.logdebug(this, 'checking ' + connection.remote_ip + ' in relay_acl_allow');

    if (!this.is_acl_allowed(connection)) {
        connection.results.add(this, {skip: 'relay_acl(unlisted)'});
        return next();
    }

    connection.results.add(this, {pass: 'relay_acl'});
    connection.relaying = true;
    return next(OK);
};

exports.relay_dest_domains = function (next, connection, params) {
    var plugin = this;
    // Skip this if the host is already allowed to relay
    if (connection.relaying) {
        connection.results.add(plugin, {skip: 'relay_dest_domain(relay)'});
        return next();
    }
 
    if (!plugin.cfg.domains) {
        connection.results.add(plugin, {skip: 'relay_dest_domain(config)'});
        return next();
    }

    var dest_domain = params[0].host;
    connection.logdebug(plugin, 'dest_domain = ' + dest_domain);

    var dst_cfg = plugin.cfg.domains[dest_domain];
    if (!dst_cfg) {
        connection.results.add(plugin, {fail: 'relay_dest_domain'});
        return next(DENY, "You are not allowed to relay");
    }

    var action = JSON.parse(dst_cfg).action;
    connection.logdebug(plugin, 'found config for ' + dest_domain + ': ' + action);

    switch(action) {
        case "accept":
            connection.relaying = true;
            connection.results.add(plugin, {pass: 'relay_dest_domain'});
            return next(OK);
        case "continue":
            connection.relaying = true;
            connection.results.add(plugin, {pass: 'relay_dest_domain'});
            return next(CONT);
        case "deny":
            connection.results.add(plugin, {fail: 'relay_dest_domain'});
            return next(DENY, "You are not allowed to relay");
    }

    connection.results.add(plugin, {fail: 'relay_dest_domain'});
    return next(DENY, "This is not an open relay");
};

/**
 * @return bool}
 */
exports.is_acl_allowed = function (connection) {
    var plugin = this;
    var ip = connection.remote_ip;
    for (var i=0; i < plugin.acl_allow.length; i++) {
        var item = plugin.acl_allow[i];
        connection.logdebug(plugin, 'checking if ' + ip + ' is in ' + item);
        var cidr = plugin.acl_allow[i].split("/");
        if (!cidr[1]) cidr[1] = 32;
        if (ipaddr.parse(ip).match(ipaddr.parse(cidr[0]), cidr[1])) {
            connection.logdebug(plugin, 'checking if ' + ip + ' is in ' + item + ": yes");
            return true;
        }
    }
    return false;
};
