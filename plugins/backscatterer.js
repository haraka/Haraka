// backscatterer plugin

exports.register = function() {
    this.inherits('dns_list_base');
};

exports.hook_mail = function (next, connection, params) {
    var txn = connection.transaction;
    var user = ((params[0] && params[0].user) ?
               params[0].user.toLowerCase() : null);
    if (!(!user || user === 'postmaster')) return next();
    // Check remote IP on ips.backscatterer.org
    var plugin = this;

    function resultCb (err, zone, a) {
        if (err) {
            connection.logerror(plugin, err);
            return next();
        }
        if (!a) return next();
        var msg = 'Host ' + connection.remote_host +
                  ' [' + connection.remote_ip + ']' +
                  ' is blacklisted by ' + zone;
        return next(DENY, msg);
    }

    this.first(connection.remote_ip, [ 'ips.backscatterer.org' ], resultCb);
};
