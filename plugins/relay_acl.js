// realy_acl

// documentation via: haraka -h plugins/realy_acl

var ipaddr = require('ipaddr.js');

exports.register = function() {
    this.register_hook('connect', 'CheckAcl');
    this.register_hook('rcpt', 'CheckRelayDomains');
};

exports.CheckAcl = function (next, connection, params) {
    this.acl_allow = this.config.get('relay_acl_allow', 'list');

    connection.logdebug(this, 'checking ' + connection.remote_ip + ' in check_acl_allow');
    if (IsAclAllowed(connection, this, connection.remote_ip)) {
        connection.relaying = 1;
        next(OK);
    } else {
        next(CONT);
    }
};

exports.CheckRelayDomains = function (next, connection, params) {
    this.dest_domains_ini = this.config.get('relay_dest_domains.ini', 'ini');
    var dest_domain = params[0].host;

    connection.logdebug(this, 'dest_domain = ' + dest_domain);
    switch(DestDomainAction(connection, this, this.dest_domains_ini['domains'], dest_domain)) {
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

function DestDomainAction(connection, plugin, domains_ini, dest_domain) {
    if (dest_domain in domains_ini) {
        var config = JSON.parse(domains_ini[dest_domain]);
        connection.logdebug(plugin, 'found config for' + dest_domain + ': ' + domains_ini['action']);
        return config['action'];
    }
    return 'deny';
}

/**
 * @return bool}
 */
function IsAclAllowed(connection, plugin, ip) {
    var i = 0;
    for (i in plugin.acl_allow) {
        connection.logdebug(plugin, 'checking if ' + ip + ' is in ' + plugin.acl_allow[i]);
        var cidr = plugin.acl_allow[i].split("/");
        if (ipaddr.parse(ip).match(ipaddr.parse(cidr[0]), cidr[1])) {
            connection.logdebug(plugin, 'checking if ' + ip + ' is in ' + plugin.acl_allow[i] + ": yes");
            return true;
        }
    }
    return false;
}
