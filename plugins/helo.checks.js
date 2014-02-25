// Check various bits of the HELO string
var net_utils = require('./net_utils');
var net = require('net');

var checks = [
    'helo_mismatch',        // HELO hostname differs between invocations
    'helo_no_dot',          // HELO has no "dot" in hostname
    'helo_match_re',        // List of regexps
    'helo_match_rdns',      // HELO hostname matches rDNS
    'helo_raw_ip',          // HELO raw IP
    'helo_is_dynamic',      // HELO looks dynamic
    'helo_big_company',     // Well known HELOs that must match rdns
    'helo_literal_mismatch' // IP literal that doesn't match connecting IP
];

var reject = 1;

exports.register = function () {
    var plugin = this;

    for (var i=0; i < checks.length; i++) {
        var hook = checks[i];
        plugin.register_hook('helo', hook);
        plugin.register_hook('ehlo', hook);
    }
};

exports.hook_connect = function (next, connection) {
    var cfg = this.config.get('helo.checks.ini');
    if (cfg.main.reject !== undefined) reject = cfg.main.reject;
    return next();
};

exports.helo_mismatch = function (next, connection, helo) {
    var plugin = this;
    var hc = connection.results.get('helo.checks');
    if (!hc) {     // first HELO result
        connection.results.add(plugin, {helo_host: helo});
        return next();
    }

    // we've been here before
    connection.results.add(plugin, {multi: true});

    var prev_helo = hc.helo_host;
    if (!prev_helo) {
        connection.results.add(plugin, {fail: 'mismatch(empty?!)'});
        return next();
    }

    if (prev_helo === helo) {
        connection.results.add(plugin, {pass: 'mismatch'});
        return next();
    }

    connection.results.add(plugin, {fail: 'mismatch('+prev_helo+' / '+helo+')'});
    return next();
};

exports.helo_no_dot = function (next, connection, helo) {
    var plugin = this;

    var hc = connection.results.get('helo.checks');
    if (hc && hc.multi) return next();

    var config = plugin.config.get('helo.checks.ini');
    if (!config.main.check_no_dot      ||
        !config.main.require_valid_tld ||
        (config.main.skip_private_ip   &&
        net_utils.is_rfc1918(connection.remote_ip)))
    {
        connection.results.add(plugin, {skip: 'no_dot'});
        return next();
    }

    if (!/\./.test(helo)) {
        connection.results.add(plugin, {fail: 'no_dot'});
        if (reject) return next(DENY, 'HELO must have a dot');
    }
    else {
        connection.results.add(plugin, {pass: 'no_dot'});
    }

    if (config.main.require_valid_tld) {
        var tld = (helo.split(/\./).reverse())[0].toLowerCase();
        if (!/^\[\d+\.\d+\.\d+\.\d+\]$/.test(helo) && !net_utils.top_level_tlds[tld]) {
            connection.results.add(plugin, {fail: 'valid_tld'});
            if (reject) return next(DENY, "HELO must have a valid TLD");
        }
        else {
            connection.results.add(plugin, {pass: 'valid_tld'});
        }
    }

    return next();
};

exports.helo_match_re = function (next, connection, helo) {
    var plugin = this;

    var hc = connection.results.get('helo.checks');
    if (hc && hc.multi) return next();

    var regexps = plugin.config.get('helo.checks.regexps', 'list');

    var fail=0;
    for (var i=0,l=regexps.length; i < l; i++) {
        var re = new RegExp('^' + regexps[i] + '$');
        if (re.test(helo)) {
            connection.results.add(plugin, {fail: 'match_re(' + regexps[i] + ')'});
            fail++;
        }
    }
    if (fail && reject) return next(DENY, "BAD HELO");
    if (!fail) connection.results.add(plugin, {pass: 'match_re'});
    return next();
};

exports.helo_match_rdns = function (next, connection, helo) {
    var plugin = this;

    var hc = connection.results.get('helo.checks');
    if (hc && hc.multi) return next();

    var config = plugin.config.get('helo.checks.ini');
    if (!config.main.check_rdns_match ) {
        connection.results.add(plugin, {skip: 'rdns_match(config)'});
        return next();
    }
    if (!helo) {
        connection.results.add(plugin, {fail: 'rdns_match(empty)'});
        return next();
    }
    var r_host = connection.remote_host;
    if (r_host && helo === r_host) {
        connection.results.add(plugin, {pass: 'rdns_match(exact)'});
        return next();
    }
    if (helo.match(/^\[(?:[0-9\.]+)\]$/)) {
        connection.results.add(plugin, {fail: 'rdns_match(literal)'});
        return next();
    }
    var r_host_bits = r_host.split('.');
    var helo_bits = helo.split('.');
    if (r_host_bits.length > 2 && helo_bits.length > 2) {
        var r_domain = r_host_bits.slice(r_host_bits.length -2, 5).join('.');
        var h_domain =   helo_bits.slice(       helo.length -2, 5).join('.');
        if (r_domain === h_domain) {
            connection.results.add(plugin, {pass: 'rdns_match(domain)'});
            return next();
        }
    }

    connection.results.add(plugin, {fail: 'rdns_match'});
    return next();
};

exports.helo_raw_ip = function (next, connection, helo) {
    var plugin = this;

    var hc = connection.results.get('helo.checks');
    if (hc && hc.multi) return next();

    var config = plugin.config.get('helo.checks.ini');
    if (!config.main.check_raw_ip ) {
        connection.results.add(plugin, {skip: 'raw_ip(config)'});
        return next();
    }
    if (config.main.skip_private_ip && net_utils.is_rfc1918(connection.remote_ip)) {
        connection.results.add(plugin, {skip: 'raw_ip(private)'});
        return next();
    }

    // RFC 2821, 4.1.1.1  Address literals must be in brackets
    // RAW IPs must be formatted: "[1.2.3.4]" not "1.2.3.4" in HELO
    if(/^\d+\.\d+\.\d+\.\d+$/.test(helo)) {
        connection.results.add(plugin, {fail: 'raw_ip(invalid literal)'});
        if (reject) return next(DENY, "Invalid address format in HELO");
        return next();
    }

    connection.results.add(plugin, {pass: 'raw_ip'});
    return next();
};

exports.helo_is_dynamic = function (next, connection, helo) {
    var plugin = this;

    var hc = connection.results.get('helo.checks');
    if (hc && hc.multi) return next();

    var config = plugin.config.get('helo.checks.ini');
    if (!config.main.check_dynamic) {
        connection.results.add(plugin, {skip: 'dynamic(config)'});
        return next();
    }
    if (config.main.skip_private_ip && net_utils.is_rfc1918(connection.remote_ip)) {
        connection.results.add(plugin, {skip: 'dynamic(private)'});
        return next();
    }

    // Skip if no dots or an IP literal or address
    if (!/\./.test(helo)) {
        connection.results.add(plugin, {skip: 'dynamic(no dots)'});
        return next();
    }

    if (/^\[?\d+\.\d+\.\d+\.\d+\]?$/.test(helo)) {
        connection.results.add(plugin, {skip: 'dynamic(addr literal)'});
        return next();
    }

    if (net_utils.is_ip_in_str(connection.remote_ip, helo)) {
        connection.results.add(plugin, {fail: 'dynamic'});
        if (reject) return next(DENY, 'HELO is dynamic');
        return next();
    }

    connection.results.add(plugin, {pass: 'dynamic'});
    return next();
};

exports.helo_big_company = function (next, connection, helo) {
    var plugin = this;

    var hc = connection.results.get('helo.checks');
    if (hc && hc.multi) return next();

    var rdns = connection.remote_host;

    var big_co = plugin.config.get('helo.checks.ini').bigco;
    if (!big_co[helo]) {
        connection.results.add(plugin, {skip: 'big_co(config)'});
        return next();
    }

    var allowed_rdns = big_co[helo].split(/,/);
    for (var i=0,l=allowed_rdns.length; i < l; i++) {
        var re = new RegExp(allowed_rdns[i].replace(/\./g, '\\.') + '$');
        if (re.test(rdns)) {
            connection.results.add(plugin, {pass: 'big_co'});
            return next();
        }
    }

    connection.results.add(plugin, {fail: 'big_co'});
    if (reject) return next(DENY, "You are not who you say you are");
    return next();
};

exports.helo_literal_mismatch = function (next, connection, helo) {
    var plugin = this;

    var hc = connection.results.get('helo.checks');
    if (hc && hc.multi) return next();

    var config = plugin.config.get('helo.checks.ini');
    if (!config.main.check_literal_mismatch) {
        connection.results.add(plugin, {skip: 'literal_mismatch(config)'});
        return next();
    }
    if (config.main.skip_private_ip && net_utils.is_rfc1918(connection.remote_ip)) {
        connection.results.add(plugin, {skip: 'literal_mismatch(private IP)'});
        return next();
    }

    var literal = /^\[(\d+\.\d+\.\d+\.\d+)\]$/.exec(helo);
    if (!literal) {
        connection.results.add(plugin, {skip: 'literal_mismatch(not literal)'});
        return next();
    }

    if (parseInt(config.main.check_literal_mismatch) === 2) {
        // Only match the /24
        if (literal[1].split(/\./).splice(0,3).join('.') !==
            connection.remote_ip.split(/\./).splice(0,3).join('.'))
        {
            connection.results.add(plugin, {fail: 'literal_mismatch'});
            if (reject) return next(DENY, 'HELO IP literal not in the same /24 as your IP address');
            return next();
        }
        connection.results.add(plugin, {pass: 'literal_mismatch'});
        return next();
    }

    if (literal[1] !== connection.remote_ip) {
        connection.results.add(plugin, {pass: 'literal_mismatch'});
        if (reject) return next(DENY, 'HELO IP literal does not match your IP address');
        return next();
    }

    connection.results.add(plugin, {pass: 'literal_mismatch'});
    return next();
};
