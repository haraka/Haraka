// relay
//
// documentation via: haraka -h relay

var ipaddr = require('ipaddr.js'),
    net    = require('net');

exports.register = function() {
    var plugin = this;
    plugin.refresh_config();
    if (plugin.cfg.relay.acl          ) { plugin.register_hook('connect',  'acl'   ); }
    if (plugin.cfg.relay.dest_domains ) { plugin.register_hook('rcpt',     'dest_domains'); }
    if (plugin.cfg.relay.all          ) { plugin.register_hook('rcpt',     'all'   ); }
    if (plugin.cfg.relay.force_routing) { plugin.register_hook('get_mx',   'force_routing'); }
};

exports.refresh_config = function() {
    var plugin = this;

    var load_relay_ini = function () {
        plugin.cfg = plugin.config.get('relay.ini', {
            booleans: [
                '+relay.acl',
                '+relay.force_routing',
                '-relay.all',
                '-relay.dest_domains',
            ],
        }, function () {
            load_relay_ini();
        });
    };

    var load_dest_domains = function () {
        plugin.loginfo(plugin, "loading relay_dest_domain.ini");
        plugin.dest = plugin.config.get('relay_dest_domains.ini', 'ini', function() {
            load_dest_domains();
        });
    };

    var load_acls = function () {
        var file_name = 'relay_acl_allow';
        plugin.loginfo(plugin, "loading " + file_name);

        // load with a self-referential callback
        plugin.acl_allow = plugin.config.get(file_name, 'list', function () {
            load_acls();
        });

        for (var i=0; i<plugin.acl_allow.length; i++) {
            var cidr = plugin.acl_allow[i].split('/');
            if (!net.isIP(cidr[0])) {
                plugin.logerror(plugin, "invalid entry in " + file_name + ": " + cidr[0]);
            }
            if (!cidr[1]) {
                plugin.logerror(plugin, "appending missing CIDR suffix in: " + file_name);
                plugin.acl_allow[i] = cidr[0] + '/32';
            }
        }
    };

    load_relay_ini();             // plugin.cfg = { }

    if (plugin.cfg.relay.acl) {
         load_acls();             // plugin.acl_allow = [..]
    }

    if (plugin.cfg.relay.force_routing || plugin.cfg.relay.dest_domains) {
        load_dest_domains();      // plugin.dest.domains = { }
    }
};

exports.acl = function (next, connection) {
    var plugin = this;
    if (!plugin.cfg.relay.acl) { return next(); }

    connection.logdebug(this, 'checking ' + connection.remote_ip + ' in relay_acl_allow');

    if (!plugin.is_acl_allowed(connection)) {
        connection.results.add(plugin, {skip: 'acl(unlisted)'});
        return next();
    }

    connection.results.add(plugin, {pass: 'acl'});
    connection.relaying = true;
    return next(OK);
};

exports.is_acl_allowed = function (connection) {
    var plugin = this;
    if (!plugin.acl_allow) { return false; }
    if (!plugin.acl_allow.length) { return false; }

    var ip = connection.remote_ip;

    for (var i=0; i < plugin.acl_allow.length; i++) {
        var item = plugin.acl_allow[i];
        connection.logdebug(plugin, 'checking if ' + ip + ' is in ' + item);
        var cidr = plugin.acl_allow[i].split('/');
        var c_net  = cidr[0];
        var c_mask = cidr[1] || 32;

        if (!net.isIP(c_net)) continue;  // bad config entry
        if (net.isIPv4(ip) && net.isIPv6(c_net)) continue;
        if (net.isIPv6(ip) && net.isIPv4(c_net)) continue;

        if (ipaddr.parse(ip).match(ipaddr.parse(c_net), c_mask)) {
            connection.logdebug(plugin, 'checking if ' + ip + ' is in ' + item + ": yes");
            return true;
        }
    }
    return false;
};

exports.dest_domains = function (next, connection, params) {
    var plugin = this;
    if (!plugin.cfg.relay.dest_domains) { return next(); }
    var transaction = connection.transaction;

    // Skip this if the host is already allowed to relay
    if (connection.relaying) {
        transaction.results.add(plugin, {skip: 'relay_dest_domain(relay)'});
        return next();
    }
 
    if (!plugin.dest) {
        transaction.results.add(plugin, {err: 'relay_dest_domain(no config!)'});
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
            // why enable relaying here? Returning next(OK) will allow the
            // address to be considered 'local'. What advantage does relaying
            // bring?
            connection.relaying = true;
            transaction.results.add(plugin, {pass: 'relay_dest_domain'});
            return next(OK);
        case "continue":
            // why oh why? Only reason I can think of is to enable outbound.
            connection.relaying = true;
            transaction.results.add(plugin, {pass: 'relay_dest_domain'});
            return next(CONT);  // same as next()
        case "deny":
            transaction.results.add(plugin, {fail: 'relay_dest_domain'});
            return next(DENY, "You are not allowed to relay");
    }

    transaction.results.add(plugin, {fail: 'relay_dest_domain'});
    return next(DENY, "Mail for that recipient is not accepted here.");
};

exports.force_routing = function (next, hmail, domain) {
    var plugin = this;
    if (!plugin.cfg.relay.force_routing) { return next(); }
    if (!plugin.dest) { return next(); }
    if (!plugin.dest.domains) { return next(); }
    var route = plugin.dest.domains[domain];

    if (!route) {
        plugin.logdebug(plugin, 'using normal MX lookup for: ' + domain);
        return next();
    }

    var c = JSON.parse(route);
    var nexthop = JSON.parse(route).nexthop;
    if (!nexthop) {
        plugin.logdebug(plugin, 'using normal MX lookup for: ' + domain);
        return next();
    }

    plugin.logdebug(plugin, 'using ' + nexthop + ' for: ' + domain);
    return next(OK, nexthop);
};

exports.all = function(next, connection, params) {
// relay everything - could be useful for a spamtrap
    var plugin = this;
    if (!plugin.cfg.relay.all) { return next(); }
// TODO: This looks like a bug (shortening the recipient array)
    var recipient = params.shift();
    connection.loginfo(plugin, "confirming recipient " + recipient);
    connection.relaying = true;
    next(OK);
};

