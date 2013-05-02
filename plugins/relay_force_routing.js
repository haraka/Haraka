// relay_force_routing

// documentation via: haraka -h plugins/relay_force_routing

exports.register = function() {
    this.register_hook('get_mx', 'force_routing');
    this.domain_ini = this.config.get('relay_dest_domains.ini', 'ini');
};

exports.force_routing = function (next, hmail, domain) {
    var force_route = lookup_routing(this, this.domain_ini['domains'], domain);
    if (force_route != "NOTFOUND" ){
        this.logdebug(this, 'using ' + force_route + ' for ' + domain);
        next(OK, force_route);
    } else {
        this.logdebug(this, 'using normal MX lookup' + ' for ' + domain);
        next(CONT);
    }
};

/**
 * @return {string}
 */

function lookup_routing (plugin, domains_ini, domain) {
    if (domain in domains_ini) {
        var config = JSON.parse(domains_ini[domain]);
        plugin.logdebug(plugin, 'found config for' + domain + ': ' + domains_ini['nexthop']);
        return config['nexthop'];
    }
    return "NOTFOUND";
}
