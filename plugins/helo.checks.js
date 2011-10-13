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

exports.helo_no_dot = function (next, connection, helo) {
    var config = this.config.get('helo.checks.ini');
    if (!config.main.check_no_dot) {
        return next();
    }
    
    /\./.test(helo) ? next() : next(DENY, "HELO must have a dot");
};

exports.helo_match_re = function (next, connection, helo) {
    var regexps = this.config.get('helo.checks.regexps', 'list');
    
    for (var i=0,l=regexps.length; i < l; i++) {
        var re = new RegExp('^' + regexps[i] + '$');
        if (re.test(helo)) {
            return next(DENY, "BAD HELO");
        }
    }
    return next();
};

exports.helo_raw_ip = function (next, connection, helo) {
    var config = this.config.get('helo.checks.ini');
    if (!config.main.check_raw_ip) {
        return next();
    }
    
    // RAW IPs must be formatted: "[1.2.3.4]" not "1.2.3.4" in HELOs
    /^\d+\.\d+\.\d+\.\d+$/.test(helo) ? 
        next(DENY, "RAW IP HELOs must be correctly formatted")
      : next();
};

exports.helo_is_dynamic = function (next, connection, helo) {
    return next(); // TODO!
};

exports.helo_big_company = function (next, connection, helo) {
    var rdns = connection.remote_host;
    
    var big_co = this.config.get('helo.checks.ini').bigco;
    if (big_co[helo]) {
        var allowed_rdns = big_co[helo].split(/,/);
        for (var i=0,l=allowed_rdns.length; i < l; i++) {
            var re = new RegExp(allowed_rdns[i].replace(/\./g, '\\.') + '$');
            if (re.test(rdns)) {
                return next();
            }
        }
        return next(DENY, "You are not who you say you are");
    }
    else {
        return next();
    }
};

