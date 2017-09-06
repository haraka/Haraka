// check rdns against list of regexps
//
// WARNING: this plugin is deprecated. see 'haraka -h access' to upgrade
//
// this plugin will be removed in a future version of Haraka.

exports.register = function () {
    this.logwarn("NOTICE: deprecated, use 'connect.rdns_access' instead!");
};

exports.hook_connect = function (next, connection) {
    const deny_list = this.config.get('rdns.deny_regexps', 'list');
    const allow_list = this.config.get('rdns.allow_regexps', 'list');

    for (let i=0, l=deny_list.length; i < l; i++) {
        let re = new RegExp(deny_list[i]);
        if (!re.test(connection.remote.host)) continue;

        for (let j=0, m=allow_list.length; j < m; j++) {
            re = new RegExp(allow_list[j]);
            if (re.test(connection.remote.host)) {
                connection.loginfo(this, "rdns matched: " + allow_list[j] +
                    ", allowing");
                return next();
            }
        }

        connection.loginfo(this, "rdns matched: " + deny_list[i] + ", blocking");
        return next(DENY, "Connection from a known bad host");
    }

    return next();
};
