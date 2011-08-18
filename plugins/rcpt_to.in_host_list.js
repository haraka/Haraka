// Check RCPT TO domain is in host list

exports.hook_rcpt = function(next, connection, params) {
    var rcpt = params[0];
    // Check for RCPT TO without an @ first - ignore those here
    if (!rcpt.host) {
        return next();
    }
    
    this.loginfo("Checking if " + rcpt + " host is in host_lists");
    
    var domain          = rcpt.host.toLowerCase();
    var host_list       = this.config.get('host_list', 'list');
    var host_list_regex = this.config.get('host_list_regex', 'list');
    var allow_subdomain =
        this.config.get('host_list.ini', 'ini').main.allow_subdomains;
    
    var i;
    for (i in host_list) {
        var tmp_domain = domain;
        while (tmp_domain.match(/\./)) {
            this.logdebug("checking " + tmp_domain + " against " +
                host_list[i]);

            // normal matches
            if (host_list[i].toLowerCase() === tmp_domain) {
                this.logdebug("Allowing " + tmp_domain);
                return next(OK);
            }
            if (allow_subdomain) {
                tmp_domain = tmp_domain.replace(/^[^\.]*\./, '');
            }
            else {
                break;
            }
        }
    }

    for (i in host_list_regex) {
        var tmp_domain = domain;
        while (tmp_domain.match(/\./)) {
            this.logdebug("checking " + tmp_domain + " against " +
                host_list[i]);

            var regex = new RegExp (host_list[i]);

            // regex matches
            if (tmp_domain.match(regex)) {
                this.logdebug("Allowing " + tmp_domain);
                return next(OK);
            }
            if (allow_subdomain) {
                tmp_domain = tmp_domain.replace(/^[^\.]*\./, '');
            }
            else {
                break;
            }
        }
    }
    
    next();
}
