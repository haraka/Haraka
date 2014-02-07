// relay_force_routing

// documentation via: haraka -h plugins/relay_force_routing

exports.hook_get_mx = function (next, hmail, domain) {
    var domain_ini = this.config.get('relay_dest_domains.ini', 'ini');
    var force_route = lookup_routing(domain_ini['domains'], domain);
    if (force_route != "NOTFOUND" ){
        this.logdebug('using ' + force_route + ' for: ' + domain);
        next(OK, force_route);
    } else {
        this.logdebug('using normal MX lookup for: ' + domain);
        next(CONT);
    }
}

/**
 * @return {string}
 */

function lookup_routing (domains_ini, domain) {
    if (domain in domains_ini) {
        var config = JSON.parse(domains_ini[domain]);
        return config['nexthop'];
    }
    return "NOTFOUND";
}
