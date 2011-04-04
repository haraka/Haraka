// check rdns against list of regexps

exports.hook_connect = function (callback, connection) {
    var re_list = this.config.get('rdns.deny_regexps');
    
    for (var i=0,l=re_list.length; i < l; i++) {
        var re = new RegExp(re_list[i]);
        if (re.test(connection.remote_host)) {
            return callback(DENY, "Connection from a known bad host");
        }
    }
    return callback(CONT);
};
