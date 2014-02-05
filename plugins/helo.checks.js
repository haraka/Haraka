// Check various bits of the HELO string
var net_utils = require('./net_utils');
var net = require('net');

// Checks to implement:
// - HELO has no "dot"
// - List of regexps
// - HELO raw IP
// - HELO looks dynamic
// - Well known HELOs that must match rdns
// - IP literal that doesn't match connecting IP

var reject=true;

exports.register = function () {
    var plugin = this;
    this.inherits('note');

    ['helo_no_dot',
     'helo_match_re',
     'helo_match_rdns',
     'helo_raw_ip',
     'helo_is_dynamic',
     'helo_big_company',
     'helo_literal_mismatch'
     ].forEach(function (hook) {
         plugin.register_hook('helo', hook);
         plugin.register_hook('ehlo', hook);
    });
};

exports.hook_connect = function (next, connection) {
    this.note_init({conn: connection, plugin: this});

    var config = this.config.get('helo.checks.ini');
    if (cfg.main.reject !== 'undefined') reject = cfg.main.reject;

    return next();
};

exports.helo_no_dot = function (next, connection, helo) {
    var config = this.config.get('helo.checks.ini');
    if (!config.main.check_no_dot      ||
        !config.main.require_valid_tld ||
        (config.main.skip_private_ip   &&
        net_utils.is_rfc1918(connection.remote_ip)))
    {
        this.note({conn: connection, skip: 'no_dot'});
        return next();
    }

    if (!/\./.test(helo)) {
        this.note({conn: connection, fail: 'no_dot'});
        if (reject) return next(DENY, 'HELO must have a dot');
    }
    else {
        this.note({conn: connection, pass: 'no_dot'});
    }

    if (config.main.require_valid_tld) {
        var tld = (helo.split(/\./).reverse())[0].toLowerCase();
        if (!/^\[\d+\.\d+\.\d+\.\d+\]$/.test(helo) && !net_utils.top_level_tlds[tld]) {
            this.note({conn: connection, fail: 'valid_tld'});
            if (reject) return next(DENY, "HELO must have a valid TLD");
        }
        else {
            this.note({conn: connection, pass: 'valid_tld'});
        }
    }

    return next();
};

exports.helo_match_re = function (next, connection, helo) {
    var regexps = this.config.get('helo.checks.regexps', 'list');

    var fail=0;
    for (var i=0,l=regexps.length; i < l; i++) {
        var re = new RegExp('^' + regexps[i] + '$');
        if (re.test(helo)) {
            this.note({conn: connection, fail: 'match_re(' + regexps[i] + ')'});
            fail++;
        }
    }
    if (fail && reject) return next(DENY, "BAD HELO");
    if (!fail) this.note({conn: connection, pass: 'match_re'});
    return next();
};

exports.helo_match_rdns = function (next, connection, helo) {
    var config = this.config.get('helo.checks.ini');
    if (!config.main.check_rdns_match ) {
        this.note({conn: connection, skip: 'check_rdns_match(config)'});
        return next();
    }
    if (!helo) {
        this.note({conn: connection, fail: 'check_rdns_match(empty)'});
        return next();
    }
    var r_host = connection.remote_host;
    if (helo && r_host && helo === r_host) {
        this.note({conn: connection, pass: 'check_rdns_match'});
        return next();
    }
    if (helo.match(/^\[(?:[0-9\.]+)\]$/)) {
        this.note({conn: connection, fail: 'check_rdns_match(literal)'});
        return next();
    }
    var r_host_bits = r_host.split('.');
    var helo_bits = helo.split('.');
    if (r_host_bits.length > 2 && helo_bits.length > 2) {
        var r_domain = r_host_bits.slice(r_host_bits.length -2, 5).join('.');
        var h_domain =   helo_bits.slice(       helo.length -2, 5).join('.');
        if (r_domain === h_domain) {
            this.note({conn: connection, pass: 'check_rdns_match(domain)'});
            return next();
        }
    }

    this.note({conn: connection, fail: 'check_rdns_match'});
    return next();
};

exports.helo_raw_ip = function (next, connection, helo) {
    var config = this.config.get('helo.checks.ini');
    if (!config.main.check_raw_ip ) {
        this.note({conn: connection, skip: 'raw_ip(config)'});
        return next();
    }
    if (config.main.skip_private_ip && net_utils.is_rfc1918(connection.remote_ip)) {
        this.note({conn: connection, skip: 'raw_ip(private)'});
        return next();
    }

    // RFC 2821, 4.1.1.1  Address literals must be in brackets
    // RAW IPs must be formatted: "[1.2.3.4]" not "1.2.3.4" in HELO
    if(/^\d+\.\d+\.\d+\.\d+$/.test(helo)) {
        this.note({conn: connection, fail: 'raw_ip(invalid literal)'});
        if (reject) return next(DENY, "Invalid address format in HELO");
        return next();
    }

    this.note({conn: connection, pass: 'raw_ip'});
    return next();
};

exports.helo_is_dynamic = function (next, connection, helo) {
    var config = this.config.get('helo.checks.ini');
    if (!config.main.check_dynamic) {
        this.note({conn: connection, skip: 'dynamic(config)'});
        return next();
    }
    if (config.main.skip_private_ip && net_utils.is_rfc1918(connection.remote_ip)) {
        this.note({conn: connection, skip: 'dynamic(private)'});
        return next();
    }

    // Skip if no dots or an IP literal or address
    if (!/\./.test(helo)) {
        this.note({conn: connection, skip: 'dynamic(no dots)'});
        return next();
    }

    if (/^\[?\d+\.\d+\.\d+\.\d+\]?$/.test(helo)) {
        this.note({conn: connection, skip: 'dynamic(addr literal)'});
        return next();
    }

    if (net_utils.is_ip_in_str(connection.remote_ip, helo)) {
        this.note({conn: connection, fail: 'dynamic', dynamic: 'fail'});
        if (reject) return next(DENY, 'HELO is dynamic');
        return next();
    }

    this.note({conn: connection, pass: 'dynamic'});
    return next();
};

exports.helo_big_company = function (next, connection, helo) {
    var rdns = connection.remote_host;

    var big_co = this.config.get('helo.checks.ini').bigco;
    if (!big_co[helo]) {
        this.note({conn: connection, skip: 'big_co(config)'});
        return next();
    }

    var allowed_rdns = big_co[helo].split(/,/);
    for (var i=0,l=allowed_rdns.length; i < l; i++) {
        var re = new RegExp(allowed_rdns[i].replace(/\./g, '\\.') + '$');
        if (re.test(rdns)) {
            this.note({conn: connection, pass: 'big_co'});
            return next();
        }
    }

    this.note({conn: connection, fail: 'big_co'});
    if (reject) return next(DENY, "You are not who you say you are");
    return next();
};

exports.helo_literal_mismatch = function (next, connection, helo) {
    var config = this.config.get('helo.checks.ini');
    if (!config.main.check_literal_mismatch) {
        this.note({conn: connection, skip: 'literal_mismatch(config)'});
        return next();
    };
    if (config.main.skip_private_ip && net_utils.is_rfc1918(connection.remote_ip)) {
        this.note({conn: connection, skip: 'literal_mismatch(private IP)'});
        return next();
    }

    var literal = /^\[(\d+\.\d+\.\d+\.\d+)\]$/.exec(helo);
    if (!literal) {
        this.note({conn: connection, skip: 'literal_mismatch(not literal)'});
        return next();
    }

    if (parseInt(config.main.check_literal_mismatch) === 2) {
        // Only match the /24
        if (literal[1].split(/\./).splice(0,3).join('.') !==
            connection.remote_ip.split(/\./).splice(0,3).join('.'))
        {
            this.note({conn: connection, fail: 'literal_mismatch'});
            if (reject) return next(DENY, 'HELO IP literal not in the same /24 as your IP address');
            return next();
        }
        this.note({conn: connection, pass: 'literal_mismatch'});
        return next();
    }

    if (literal[1] !== connection.remote_ip) {
        this.note({conn: connection, pass: 'literal_mismatch'});
        if (reject) return next(DENY, 'HELO IP literal does not match your IP address');
        return next();
    }

    this.note({conn: connection, pass: 'literal_mismatch'});
    return next();
};
