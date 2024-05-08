// relay
//
// documentation via: haraka -h relay

const net = require('node:net');

const ipaddr = require('ipaddr.js');

exports.register = function () {

    this.load_relay_ini();             // plugin.cfg = { }

    if (this.cfg.relay.acl) {
        this.load_acls();             // plugin.acl_allow = [..]
        this.register_hook('connect_init', 'acl');
        this.register_hook('connect', 'pass_relaying');
    }

    if (this.cfg.relay.force_routing || this.cfg.relay.dest_domains) {
        this.load_dest_domains();      // plugin.dest.domains = { }
    }

    if (this.cfg.relay.force_routing) {
        this.register_hook('get_mx', 'force_routing');
    }

    if (this.cfg.relay.dest_domains) {
        this.register_hook('rcpt', 'dest_domains');
    }

    if (this.cfg.relay.all) {
        this.register_hook('rcpt', 'all');
    }
}

exports.load_relay_ini = function () {
    this.cfg = this.config.get('relay.ini', {
        booleans: [
            '+relay.acl',
            '+relay.force_routing',
            '-relay.all',
            '-relay.dest_domains',
        ],
    }, () => {
        this.load_relay_ini();
    });
}

exports.load_dest_domains = function () {
    this.dest = this.config.get(
        'relay_dest_domains.ini',
        'ini',
        () => { this.load_dest_domains(); }
    );
}

exports.load_acls = function () {
    const file_name = 'relay_acl_allow';

    // load with a self-referential callback
    this.acl_allow = this.config.get(file_name, 'list', () => {
        this.load_acls();
    });

    for (let i=0; i<this.acl_allow.length; i++) {
        const cidr = this.acl_allow[i].split('/');
        if (!net.isIP(cidr[0])) {
            this.logerror(this, `invalid entry in ${file_name}: ${cidr[0]}`);
        }
        if (!cidr[1]) {
            this.logerror(this, `appending missing CIDR suffix in: ${file_name}`);
            this.acl_allow[i] = `${cidr[0]  }/32`;
        }
    }
}

exports.acl = function (next, connection) {
    if (!this.cfg.relay.acl) { return next(); }

    connection.logdebug(this, `checking ${connection.remote.ip} in relay_acl_allow`);

    if (!this.is_acl_allowed(connection)) {
        connection.results.add(this, {skip: 'acl(unlisted)'});
        return next();
    }

    connection.results.add(this, {pass: 'acl'});
    connection.relaying = true;
    return next(OK);
}

exports.pass_relaying = (next, connection) => {
    if (connection.relaying) return next(OK);

    next();
}

exports.is_acl_allowed = function (connection) {
    if (!this.acl_allow) { return false; }
    if (!this.acl_allow.length) { return false; }

    const { ip } = connection.remote;

    for (const item of this.acl_allow) {
        connection.logdebug(this, `checking if ${ip} is in ${item}`);
        const cidr = item.split('/');
        const c_net  = cidr[0];
        const c_mask = cidr[1] || 32;

        if (!net.isIP(c_net)) continue;  // bad config entry
        if (net.isIPv4(ip) && net.isIPv6(c_net)) continue;
        if (net.isIPv6(ip) && net.isIPv4(c_net)) continue;

        if (ipaddr.parse(ip).match(ipaddr.parse(c_net), c_mask)) {
            connection.logdebug(this, `checking if ${ip} is in ${item}: yes`);
            return true;
        }
    }
    return false;
}

exports.dest_domains = function (next, connection, params) {
    if (!this.cfg.relay.dest_domains) { return next(); }
    const { relaying, transaction } = connection ?? {}
    if (!transaction) return next();

    // Skip this if the host is already allowed to relay
    if (relaying) {
        transaction.results.add(this, {skip: 'relay_dest_domain(relay)'});
        return next();
    }

    if (!this.dest) {
        transaction.results.add(this, {err: 'relay_dest_domain(no config!)'});
        return next();
    }

    if (!this.dest.domains) {
        transaction.results.add(this, {skip: 'relay_dest_domain(config)'});
        return next();
    }

    const dest_domain = params[0].host;
    connection.logdebug(this, `dest_domain = ${dest_domain}`);

    const dst_cfg = this.dest.domains[dest_domain];
    if (!dst_cfg) {
        transaction.results.add(this, {fail: 'relay_dest_domain'});
        return next(DENY, "You are not allowed to relay");
    }

    const { action } = JSON.parse(dst_cfg);
    connection.logdebug(this, `found config for ${dest_domain}: ${action}`);

    switch (action) {
        case "accept":
            // why enable relaying here? Returning next(OK) will allow the
            // address to be considered 'local'. What advantage does relaying
            // bring?
            connection.relaying = true;
            transaction.results.add(this, {pass: 'relay_dest_domain'});
            return next(OK);
        case "continue":
            // why oh why? Only reason I can think of is to enable outbound.
            connection.relaying = true;
            transaction.results.add(this, {pass: 'relay_dest_domain'});
            return next(CONT);  // same as next()
        case "deny":
            transaction.results.add(this, {fail: 'relay_dest_domain'});
            return next(DENY, "You are not allowed to relay");
    }

    transaction.results.add(this, {fail: 'relay_dest_domain'});
    next(DENY, "Mail for that recipient is not accepted here.");
}

exports.force_routing = function (next, hmail, domain) {
    if (!this.cfg.relay.force_routing) { return next(); }
    if (!this.dest) { return next(); }
    if (!this.dest.domains) { return next(); }
    let route = this.dest.domains[domain];

    if (!route) {
        route = this.dest.domains.any;
        if (!route) {
            this.logdebug(this, `using normal MX lookup for: ${domain}`);
            return next();
        }
    }

    const { nexthop } = JSON.parse(route);
    if (!nexthop) {
        this.logdebug(this, `using normal MX lookup for: ${domain}`);
        return next();
    }

    this.logdebug(this, `using ${nexthop} for: ${domain}`);
    next(OK, nexthop);
}

exports.all = function (next, connection, params) {
    if (!this.cfg.relay.all) { return next(); }

    connection.loginfo(this, `confirming recipient ${params[0]}`);
    connection.relaying = true;
    next(OK);
}
