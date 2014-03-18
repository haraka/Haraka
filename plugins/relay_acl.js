// relay_acl

// documentation via: haraka -h plugins/relay_acl

var ipaddr = require('ipaddr.js');

exports.register = function() {
    this.register_hook('connect', 'relay_acl');
    this.register_hook('rcpt',    'relay_dest_domains');
};

exports.relay_acl = function (next, connection, params) {
    this.acl_allow = this.config.get('relay_acl_allow', 'list');

    connection.logdebug(this, 'checking ' + connection.remote_ip + ' in relay_acl_allow');
    if (this.is_acl_allowed(connection)) {
        connection.relaying = true;
        return next(OK);
    }
    return next();
};

exports.relay_dest_domains = function (next, connection, params) {
    // Skip this if the host is already allowed to relay
    if (connection.relaying) return next();
 
    this.dest_domains_ini = this.config.get('relay_dest_domains.ini', 'ini');
    if (!this.dest_domains_ini.domains) return next();

    var dest_domain = params[0].host;
    connection.logdebug(this, 'dest_domain = ' + dest_domain);

    switch(dest_domain_action(connection, this, this.dest_domains_ini['domains'], dest_domain)) {
        case "accept":
            connection.relaying = true;
            next(OK);
            break;
        case "continue":
            connection.relaying = true;
            next(CONT);
            break;
        case "deny":
            next(DENY, "You are denied to relay");
            break;
        default:
            next(DENY, "This is not an open relay");
    }
};

/**
 * @return {string}
 */

function dest_domain_action(connection, plugin, domains_ini, dest_domain) {
    if (dest_domain in domains_ini) {
        var config = JSON.parse(domains_ini[dest_domain]);
        connection.logdebug(plugin, 'found config for ' + dest_domain + ': ' + domains_ini['action']);
        return config['action'];
    }
    return 'deny';
}

/**
 * @return bool}
 */
exports.is_acl_allowed = function (connection) {
    var plugin = this;
    var ip = connection.remote_ip;
    for (var i in plugin.acl_allow) {
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
