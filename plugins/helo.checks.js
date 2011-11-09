// Check various bits of the HELO string
var net_utils = require('./net_utils');

// Checks to implement:
// - HELO has no "dot"
// - List of regexps
// - HELO raw IP
// - HELO looks dynamic
// - Well known HELOs that must match rdns
// - IP literal that doesn't match connecting IP

exports.register = function () {
    var plugin = this;
    ['helo_no_dot',
     'helo_match_re',
     'helo_raw_ip',
     'helo_is_dynamic',
     'helo_big_company',
     'helo_literal_mismatch'
     ].forEach(function (hook) {
         plugin.register_hook('helo', hook);
         plugin.register_hook('ehlo', hook);
    });
}

exports.helo_no_dot = function (next, connection, helo) {
    var config = this.config.get('helo.checks.ini');
    if (!config.main.check_no_dot      ||
        !config.main.require_valid_tld ||
        (config.main.skip_private_ip   &&
        net_utils.is_rfc1918(connection.remote_ip))) 
    {
        return next();
    }

    if (!/\./.test(helo)) {
        return next(DENY, 'HELO must have a dot');
    }

    if (config.main.require_valid_tld) {
        var tld = (helo.split(/\./).reverse())[0];
        if (!/^\[\d+\.\d+\.\d+\.\d+\]$/.test(helo) && !net_utils.top_level_tlds[tld]) {
            return next(DENY, "HELO must have a valid TLD");
        }
    }

    return next();
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
    if (!config.main.check_raw_ip     ||
        (config.main.skip_private_ip  &&
        net_utils.is_rfc1918(connection.remote_ip)))
    {
        return next();
    }
    
    // RAW IPs must be formatted: "[1.2.3.4]" not "1.2.3.4" in HELOs
    /^\d+\.\d+\.\d+\.\d+$/.test(helo) ? 
        next(DENY, "RAW IP HELOs must be correctly formatted")
      : next();
};

exports.helo_is_dynamic = function (next, connection, helo) {
    var config = this.config.get('helo.checks.ini');
    if (!config.main.check_dynamic   ||
        (config.main.skip_private_ip &&
        net_utils.is_rfc1918(connection.remote_ip)))
    {
        return next();
    }

    // Skip if no dots or an IP literal or address
    if (!/\./.test(helo) || /^\[?\d+\.\d+\.\d+\.\d+\]?$/.test(helo)) {
        return next();
    }

    (net_utils.is_ip_in_str(connection.remote_ip, helo)) ?
        next(DENY, 'HELO is dynamic')
      : next();
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

exports.helo_literal_mismatch = function (next, connection, helo) {
    var config = this.config.get('helo.checks.ini');
    if (!config.main.check_literal_mismatch ||
        (config.main.skip_private_ip        &&
        net_utils.is_rfc1918(connection.remote_ip)))
    {
        return next();
    }

    var literal = /^\[(\d+\.\d+\.\d+\.\d+)\]$/.exec(helo);
    if (literal) {
        if (parseInt(config.main.check_literal_mismatch) === 2) {
            // Only match the /24
            if (literal[1].split(/\./).splice(0,3).join('.') !== 
                connection.remote_ip.split(/\./).splice(0,3).join('.'))
            {
                return next(DENY, 'HELO IP literal not in the same /24 as your IP address');
            }
            return next();
        }

        if (literal[1] !== connection.remote_ip) {
            return next(DENY, 'HELO IP literal does not match your IP address');
        }
    }
    return next();
}
