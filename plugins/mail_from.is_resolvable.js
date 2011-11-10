// Check MAIL FROM domain is resolvable to an MX

var dns = require('dns');

exports.hook_mail = function(next, connection, params) {
    var mail_from    = params[0];

    // Check for MAIL FROM without an @ first - ignore those here
    if (!mail_from.host) {
        return next();
    }

    var called_next  = 0;
    var timeout_id   = 0;
    var plugin       = this;
    var domain       = mail_from.host;
    var config       = this.config.get('mail_from.is_resolvable.ini');
    var timeout      = config.general && (config.general['timeout']     || 60);
    var timeout_msg  = config.general && (config.general['timeout_msg'] || '');

    // Just in case DNS never comes back (UDP), we should DENYSOFT.
    timeout_id = setTimeout(function () {
        plugin.loginfo('timed out when looking up ' + domain +
            '\'s MX record. Disconnecting.'), connection;
        called_next++;
        return next(DENYSOFT, timeout_msg);
    }, timeout * 1000);

    dns.resolveMx(domain, function(err, addresses) {
        if (called_next) {
            // This happens when we've called next() from our plugin timeout
            // handler, but we eventually get a response from DNS.  We do not
            // want to call next() again, so we just return. 
            return;
        }
        if (err && err.code != dns.NXDOMAIN && err.code != 'ENOTFOUND') {
            plugin.logerror("DNS Error: " + err, connection);
            clearTimeout(timeout_id);
            return next(DENYSOFT, "Temporary resolver error");
        }
        if (addresses && addresses.length) {
            clearTimeout(timeout_id);
            return next();
        }
        clearTimeout(timeout_id);
        return next(DENYSOFT, "No MX for your FROM address");
    });
}
