// relay_force_routing

// documentation via: haraka -h plugins/relay_force_routing

exports.register = function() {
    this.logerror(this, "deprecated. see 'haraka -h relay'");
};

exports.hook_get_mx = function (next, hmail, domain) {
    var domain_ini = this.config.get('relay_dest_domains.ini', 'ini');
    var force_route = lookup_routing(domain_ini['domains'], domain);
    this.logerror(this, "deprecated. see 'haraka -h relay'");
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
