// Check MAIL FROM domain is resolvable to an MX

var dns = require('dns');
var smtp = require('../constants');

exports.hook_mail = function(callback, connection, params) {
    var mail_from = params[0];
    // Check for MAIL FROM without an @ first - ignore those here
    if (!mail_from.match(/@/)) {
        return callback(smtp.cont);
    }
    var matches = mail_from.match(/@([^@>]*)>?/);
    if (!matches) {
        this.logerror("FROM address does not parse: " + mail_from);
        return callback(smtp.deny, "FROM address does not parse");
    }
    
    var domain = matches[1];
    var plugin = this;
    
    dns.resolveMx(domain, function(err, addresses) {
        if (err && err.code != dns.NXDOMAIN) {
            plugin.logerror("DNS Error: " + err);
            return callback(smtp.denysoft, "Temporary resolver error");
        }
        if (addresses && addresses.length) {
            return callback(smtp.cont, "From address is OK");
        }
        return callback(smtp.denysoft, "No MX for your FROM address");
    });
}
