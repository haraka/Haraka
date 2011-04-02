// Check various bits of the HELO string

// Checks to implement:
// - HELO has no "dot"
// - List of regexps
// - HELO raw IP
// - HELO looks dynamic
// - Well known HELOs that must match rdns

exports.register = function () {
    var plugin = this;
    ['helo_no_dot',
     'helo_match_re',
     'helo_raw_ip',
     'helo_is_dynamic',
     'helo_big_company'
     ].forEach(function (hook) {
         plugin.register_hook('helo', hook);
         plugin.register_hook('ehlo', hook);
    });
}

exports.helo_no_dot = function (callback, connection, params) {
    var config = this.config.get('helo.checks.ini', 'ini');
    if (!config.main.check_no_dot) {
        return callback(CONT);
    }
    
    var helo = params[0];
    
    /\./.test(helo) ? callback(CONT) : callback(DENY, "HELO must have a dot");
};

exports.helo_match_re = function (callback, connection, params) {
    var regexps = this.config.get('helo.checks.regexps', 'list');
    
    var helo = params[0];
    
    for (var i=0,l=regexps.length; i < l; i++) {
        var re = new RegExp('^' + regexps[i] + '$');
        if (re.test(helo)) {
            return callback(DENY, "BAD HELO");
        }
    }
    return callback(CONT);
};

exports.helo_raw_ip = function (callback, connection, params) {
    var config = this.config.get('helo.checks.ini', 'ini');
    if (!config.main.check_raw_ip) {
        return callback(CONT);
    }
    
    var helo = params[0];
    
    // RAW IPs must be formatted: "[1.2.3.4]" not "1.2.3.4" in HELOs
    /^\d+\.\d+\.\d+\.\d+$/.test(helo) ? 
        callback(DENY, "RAW IP HELOs must be correctly formatted")
      : callback(CONT);
};

exports.helo_is_dynamic = function (callback, connection, params) {
    return callback(CONT); // TODO!
};

exports.helo_big_company = function (callback, connection, params) {
    var helo = params[0];
    var rdns = connection.remote_host;
    
    var big_co = this.config.get('helo.checks.ini', 'ini').bigco;
    if (big_co[helo]) {
        var allowed_rdns = big_co[helo].split(/,/);
        for (var i=0,l=allowed_rdns.length; i < l; i++) {
            var re = new RegExp(allowed_rdns[i].replace(/\./g, '\\.') + '$');
            if (re.test(rdns)) {
                return callback(CONT);
            }
        }
        return callback(DENY, "You are not who you say you are");
    }
    else {
        return callback(CONT);
    }
};

