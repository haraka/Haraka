// check rdns against list of regexps
//
// WARNING: The services offered by this plugin, and much more, are now provided
// more efficiently with the connect.rdns_access plugin.  Please transition over
// to using the new connect.rdns_access plugin, as this plugin is now deprecated
// and may be removed in a future version of Haraka.

exports.register = function () {
    this.logwarn("NOTICE: deprecated, use 'connect.rdns_access' instead!");
}

exports.hook_connect = function (next, connection) {
    var deny_list = this.config.get('rdns.deny_regexps', 'list');
    var allow_list = this.config.get('rdns.allow_regexps', 'list');
    
    for (var i=0,l=deny_list.length; i < l; i++) {
        var re = new RegExp(deny_list[i]);
        if (re.test(connection.remote_host)) {
            for (var i=0,l=allow_list.length; i < l; i++) {
                var re = new RegExp(allow_list[i]);
                if (re.test(connection.remote_host)) {
                    connection.loginfo(this, "rdns matched: " + allow_list[i] +
                        ", allowing");
                    return next();
                }
            }

            connection.loginfo(this, "rdns matched: " + deny_list[i] + ", blocking");
            return next(DENY, "Connection from a known bad host");
        }
    }

    return next();
};
