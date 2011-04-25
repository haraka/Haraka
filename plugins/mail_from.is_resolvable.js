// Check MAIL FROM domain is resolvable to an MX

var dns = require('dns');

exports.hook_mail = function(next, connection, params) {
    var mail_from = params[0];
    // Check for MAIL FROM without an @ first - ignore those here
    if (!mail_from.match(/@/)) {
        return next();
    }
    var matches = mail_from.match(/@([^@>]*)>?/);
    if (!matches) {
        this.logerror("FROM address does not parse: " + mail_from);
        return next(DENY, "FROM address does not parse");
    }
    
    var domain = matches[1];
    var plugin = this;
    
    dns.resolveMx(domain, function(err, addresses) {
        if (err && err.code != dns.NXDOMAIN) {
            plugin.logerror("DNS Error: " + err);
            return next(DENYSOFT, "Temporary resolver error");
        }
        if (addresses && addresses.length) {
            return next(OK, "From address is OK");
        }
        return next(DENYSOFT, "No MX for your FROM address");
    });
}
