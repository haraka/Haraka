// relay
//
// documentation via: haraka -h relay

var ipaddr = require('ipaddr.js'),
    net    = require('net');

exports.register = function() {
    var plugin = this;
    plugin.refresh_config();
    plugin.register_hook('connect',     'acl');
    plugin.register_hook('rcpt',        'dest_domains');
    plugin.register_hook('rcpt',        'relay_all');
    plugin.register_hook('get_mx',      'force_routing');
};

exports.refresh_config = function(next, connection) {
    var plugin = this;

    var load_relay_ini = function () {
        plugin.cfg = plugin.config.get('relay.ini', {
            booleans: [
                '-relay.any',
                '+relay.acl',
                '+relay.dest_domains',
                '+relay.force_routing',
            ],
        }, function () {
            load_relay_ini();
        });
    };

    var load_dest_domains = function () {
        plugin.loginfo(plugin, "loading relay_dest_domain.ini");
        // TODO: validate the entries
        plugin.dest = plugin.config.get('relay_dest_domains.ini', 'ini', function() {
            load_dest_domains();
        });
    };

    var load_acls = function () {
        var file_name = 'relay_acl_allow';
        plugin.loginfo(plugin, "loading " + file_name);

        // TODO: validate the IPs in the list. Make sure
        // they're IPv4 or IPv6. Make sure they have a netmask.

        // load with a self-referential callback
        plugin.acl_allow = plugin.config.get(file_name, 'list', function () {
            load_acls();
        });
    };

    load_relay_ini();

    if (plugin.cfg.relay.acl) { load_acls(); }

    if (plugin.cfg.relay.force_routing || plugin.cfg.relay.dest_domains) {
        load_dest_domains();
    }
};

exports.acl = function (next, connection, params) {
    connection.logdebug(this, 'checking ' + connection.remote_ip + ' in relay_acl_allow');

    if (!this.is_acl_allowed(connection)) {
        connection.results.add(this, {skip: 'acl(unlisted)'});
        return next();
    }

    connection.results.add(this, {pass: 'acl'});
    connection.relaying = true;
    return next(OK);
};

exports.dest_domains = function (next, connection, params) {
    var plugin = this;
    var transaction = connection.transaction;

    // Skip this if the host is already allowed to relay
    if (connection.relaying) {
        transaction.results.add(plugin, {skip: 'relay_dest_domain(relay)'});
        return next();
    }
 
    if (!plugin.dest.domains) {
        transaction.results.add(plugin, {skip: 'relay_dest_domain(config)'});
        return next();
    }

    var dest_domain = params[0].host;
    connection.logdebug(plugin, 'dest_domain = ' + dest_domain);

    var dst_cfg = plugin.dest.domains[dest_domain];
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

exports.is_acl_allowed = function (connection) {
    var plugin = this;
    if (!plugin.acl_allow) { return false; }
    if (!plugin.acl_allow.length) { return false; }

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

exports.force_routing = function (next, hmail, domain) {
    var plugin = this;
    if (!plugin.relay.force_routing) { return next; }
    if (!plugin.dest.domains) return next();
    var route = plugin.dest.domains[domain];

    if (!route) {
        plugin.logdebug(plugin, 'using normal MX lookup for: ' + domain);
        return next();
    }

    var nexthop = JSON.parse(route).nexthop;

    plugin.logdebug(plugin, 'using ' + nexthop + ' for: ' + domain);
    return next(OK, nexthop);
};

exports.relay_all = function(next, connection, params) {
// relay everything - could be useful for a spamtrap
    var recipient = params.shift();
    connection.loginfo(this, "confirming recipient " + recipient);
    connection.relaying = true;
    next(OK);
};

