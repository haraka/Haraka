// relay_acl

// documentation via: haraka -h plugins/relay_acl

var ipaddr = require('ipaddr.js'),
    net    = require('net');

exports.register = function() {
    this.logerror(this, "deprecated. see 'haraka -h relay'");
    this.register_hook('lookup_rdns', 'refresh_config');
    this.register_hook('connect',     'relay_acl');
    this.register_hook('rcpt',        'relay_dest_domains');
};

exports.refresh_config = function(next, connection) {
    this.cfg = this.config.get('relay_dest_domains.ini', 'ini');
    this.acl_allow = this.config.get('relay_acl_allow', 'list');
    return next();
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
    var transaction = connection.transaction;

    // Skip this if the host is already allowed to relay
    if (connection.relaying) {
        transaction.results.add(plugin, {skip: 'relay_dest_domain(relay)'});
        return next();
    }
 
    if (!plugin.cfg.domains) {
        transaction.results.add(plugin, {skip: 'relay_dest_domain(config)'});
        return next();
    }

    var dest_domain = params[0].host;
    connection.logdebug(plugin, 'dest_domain = ' + dest_domain);

    var dst_cfg = plugin.cfg.domains[dest_domain];
    if (!dst_cfg) {
        transaction.results.add(plugin, {fail: 'relay_dest_domain'});
        return next(DENY, "You are not allowed to relay");
    }

    var action = JSON.parse(dst_cfg).action;
    connection.logdebug(plugin, 'found config for ' + dest_domain + ': ' + action);

    switch(action) {
        case "accept":
            connection.relaying = true;
            transaction.results.add(plugin, {pass: 'relay_dest_domain'});
            return next(OK);
        case "continue":
            connection.relaying = true;
            transaction.results.add(plugin, {pass: 'relay_dest_domain'});
            return next(CONT);
        case "deny":
            transaction.results.add(plugin, {fail: 'relay_dest_domain'});
            return next(DENY, "You are not allowed to relay");
    }

    transaction.results.add(plugin, {fail: 'relay_dest_domain'});
    return next(DENY, "This is not an open relay");
};

/**
 * @return bool}
 */
exports.is_acl_allowed = function (connection) {
    var plugin = this;
    if (!plugin.acl_allow) return false;
    if (!plugin.acl_allow.length) return false;

    var ip = connection.remote_ip;

    for (var i=0; i < plugin.acl_allow.length; i++) {
        var item = plugin.acl_allow[i];
        connection.logdebug(plugin, 'checking if ' + ip + ' is in ' + item);
        var cidr = plugin.acl_allow[i].split("/");
        var c_net  = cidr[0];
        var c_mask = cidr[1] || 32;

        if (net.isIPv4(ip) && net.isIPv6(c_net)) continue;
        if (net.isIPv6(ip) && net.isIPv4(c_net)) continue;

        if (ipaddr.parse(ip).match(ipaddr.parse(c_net), c_mask)) {
            connection.logdebug(plugin, 'checking if ' + ip + ' is in ' + item + ": yes");
            return true;
        }
    }
    return false;
};
