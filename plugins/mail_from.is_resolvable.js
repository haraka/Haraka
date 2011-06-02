// Check MAIL FROM domain is resolvable to an MX

var dns = require('dns');

exports.hook_mail = function(next, connection, params) {
    var mail_from = params[0];
    // Check for MAIL FROM without an @ first - ignore those here
    if (!mail_from.host) {
        return next();
    }
    
    var domain = mail_from.host;
    var plugin = this;
    
    // TODO: this is too simple I think - needs work on handling DNS errors
    dns.resolveMx(domain, function(err, addresses) {
        if (err && err.code != dns.NXDOMAIN && err.code != 'ENOTFOUND') {
            plugin.logerror("DNS Error: " + err);
            return next(DENYSOFT, "Temporary resolver error");
        }
        if (addresses && addresses.length) {
            return next();
        }
        return next(DENYSOFT, "No MX for your FROM address");
    });
}
