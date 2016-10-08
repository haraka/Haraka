// spf

var SPF = require('./spf').SPF;
var net_utils = require('haraka-net-utils');

exports.register = function () {
    var plugin = this;

    // Override logging in SPF module
    SPF.prototype.log_debug = function (str) {
        return plugin.logdebug(str);
    };

    plugin.load_config();
};

exports.load_config = function () {
    var plugin = this;
    plugin.cfg = plugin.config.get('spf.ini', {
        booleans: [
            '-defer.helo_temperror',
            '-defer.mfrom_temperror',

            '-defer_relay.helo_temperror',
            '-defer_relay.mfrom_temperror',

            '-deny.helo_softfail',
            '-deny.helo_fail',
            '-deny.helo_permerror',

            '-deny.mfrom_softfail',
            '-deny.mfrom_fail',
            '-deny.mfrom_permerror',

            '-deny_relay.helo_softfail',
            '-deny_relay.helo_fail',
            '-deny_relay.helo_permerror',

            '-deny_relay.mfrom_softfail',
            '-deny_relay.mfrom_fail',
            '-deny_relay.mfrom_permerror',
        ]
    },
    function () { plugin.load_config(); }
    );

    // when set, preserve legacy config settings
    ['helo','mail'].forEach(function (phase) {
        if (plugin.cfg.main[phase + '_softfail_reject']) {
            plugin.cfg.deny[phase + '_softfail'] = true;
        }
        if (plugin.cfg.main[phase + '_fail_reject']) {
            plugin.cfg.deny[phase + '_fail'] = true;
        }
        if (plugin.cfg.main[phase + '_temperror_defer']) {
            plugin.cfg.defer[phase + '_temperror'] = true;
        }
        if (plugin.cfg.main[phase + '_permerror_reject']) {
            plugin.cfg.deny[phase + '_permerror'] = true;
        }
    });

    if (!plugin.cfg.relay) {
        plugin.cfg.relay = { context: 'sender' };  // default/legacy
    }
};

exports.hook_helo = exports.hook_ehlo = function (next, connection, helo) {
    var plugin = this;

    // Bypass private IPs
    if (net_utils.is_private_ip(connection.remote.ip)) { return next(); }

    // RFC 4408, 2.1: "SPF clients must be prepared for the "HELO"
    //           identity to be malformed or an IP address literal.
    if (net_utils.is_ip_literal(helo)) {
        connection.results.add(plugin, {skip: 'ip_literal'});
        return next();
    }

    var timeout = false;
    var spf = new SPF();
    var timer = setTimeout(function () {
        timeout = true;
        connection.logerror(plugin, 'timeout');
        return next();
    }, (plugin.timeout-1) * 1000);

    spf.check_host(connection.remote.ip, helo, null, function (err, result) {
        if (timer) clearTimeout(timer);
        if (timeout) return;
        if (err) {
            connection.logerror(plugin, err);
            return next();
        }
        var host = connection.hello.host;
        plugin.log_result(connection, 'helo', host, 'postmaster@' +
            host, spf.result(result));

        connection.notes.spf_helo = result;  // used between hooks
        connection.results.add(plugin, {
            scope: 'helo',
            result: spf.result(result),
            domain: host,
            emit: true,
        });
        return next();
    });
};

exports.hook_mail = function (next, connection, params) {
    var plugin = this;

    // For inbound message from a private IP, skip MAIL FROM check
    if (!connection.relaying &&
         net_utils.is_private_ip(connection.remote.ip)) {
        return next();
    }

    var txn = connection.transaction;
    if (!txn) return next();

    var mfrom = params[0].address();
    var host = params[0].host;
    var spf = new SPF();
    var auth_result;

    if (connection.notes.spf_helo) {
        var h_result = connection.notes.spf_helo;
        var h_host = connection.hello.host;
        plugin.save_to_header(connection, spf, h_result, mfrom, h_host, 'helo');
        if (!host) {   // Use results from HELO if the return-path is null
            auth_result = spf.result(h_result).toLowerCase();
            connection.auth_results( "spf="+auth_result+" smtp.helo=" + h_host);

            var sender = '<> via ' + h_host;
            return plugin.return_results(next, connection, spf, 'helo',
                h_result, sender);
        }
    }

    if (!host) return next();  // null-sender

    var timeout = false;
    var timer = setTimeout(function () {
        timeout = true;
        connection.logerror(plugin, 'timeout');
        return next();
    }, (plugin.timeout-1) * 1000);

    spf.helo = connection.hello.host;

    var ch_cb = function (err, result, ip) {
        if (timer) clearTimeout(timer);
        if (timeout) return;
        if (err) {
            connection.logerror(plugin, err);
            return next();
        }
        plugin.log_result(connection, 'mfrom', host, mfrom,
                          spf.result(result), (ip ? ip : connection.remote.ip));
        plugin.save_to_header(connection, spf, result, mfrom, host,
                              'mailfrom', (ip ? ip : connection.remote.ip));

        auth_result = spf.result(result).toLowerCase();
        connection.auth_results( "spf="+auth_result+" smtp.mailfrom="+host);

        txn.notes.spf_mail_result = spf.result(result);
        txn.notes.spf_mail_record = spf.spf_record;
        txn.results.add(plugin, {
            scope: 'mfrom',
            result: spf.result(result),
            domain: host,
            emit: true,
        });
        return plugin.return_results(next, connection, spf, 'mfrom', result,
            '<'+mfrom+'>');
    };

    // typical inbound (!relay)
    if (!connection.relaying) {
        return spf.check_host(connection.remote.ip, host, mfrom, ch_cb);
    }

    // outbound (relaying), context=sender
    if (plugin.cfg.relay.context === 'sender') {
        return spf.check_host(connection.remote.ip, host, mfrom, ch_cb);
    }

    // outbound (relaying), context=myself
    net_utils.get_public_ip(function(e, my_public_ip) {
        // We always check the client IP first, because a relay
        // could be sending inbound mail from a non-local domain
        // which could case an incorrect SPF Fail result if we
        // check the public IP first, so we only check the public
        // IP if the client IP returns a result other than 'Pass'.
        spf.check_host(connection.remote.ip, host, mfrom, function (err, result) {
            var spf_result;
            if (result) {
                spf_result = spf.result(result).toLowerCase();
            }
            if (err || spf_result && spf_result !== 'pass') {
                if (e) {
                    // Error looking up public IP
                    return ch_cb(e);
                }
                if (!my_public_ip) {
                    return ch_cb(new Error("failed to discover public IP"));
                }
                return spf.check_host(my_public_ip, host, mfrom, function (er, r) {
                    return ch_cb(er, r, my_public_ip);
                });
            }
            ch_cb(err, result, connection.remote.ip);
        });
    });
};

exports.log_result = function (connection, scope, host, mfrom, result, ip) {
    connection.loginfo(this, [
        'identity=' + scope,
        'ip=' + (ip ? ip : connection.remote.ip),
        'domain="' + host + '"',
        'mfrom=<' + mfrom + '>',
        'result=' + result
    ].join(' '));
};

exports.return_results = function(next, connection, spf, scope, result, sender) {
    var plugin = this;
    var msgpre = 'sender ' + sender;
    var deny = connection.relaying ? 'deny_relay' : 'deny';
    var defer = connection.relaying ? 'defer_relay' : 'defer';

    switch (result) {
        case spf.SPF_NONE:
        case spf.SPF_NEUTRAL:
        case spf.SPF_PASS:
            return next();
        case spf.SPF_SOFTFAIL:
            if (plugin.cfg[deny][scope + '_softfail']) {
                return next(DENY, msgpre + ' SPF SoftFail');
            }
            return next();
        case spf.SPF_FAIL:
            if (plugin.cfg[deny][scope + '_fail']) {
                return next(DENY, msgpre + ' SPF Fail');
            }
            return next();
        case spf.SPF_TEMPERROR:
            if (plugin.cfg[defer][scope + '_temperror']) {
                return next(DENYSOFT, msgpre + ' SPF Temporary Error');
            }
            return next();
        case spf.SPF_PERMERROR:
            if (plugin.cfg[deny][scope + '_permerror']) {
                return next(DENY, msgpre + ' SPF Permanent Error');
            }
            return next();
        default:
            // Unknown result
            connection.logerror(plugin, 'unknown result code=' + result);
            return next();
    }
};

exports.save_to_header = function (connection, spf, result, mfrom, host, id, ip) {
    var plugin = this;
    // Add a trace header
    if (!connection) return;
    if (!connection.transaction) return;
    connection.transaction.add_leading_header('Received-SPF',
        spf.result(result) +
        ' (' + plugin.config.get('me') + ': domain of ' + host +
        ((result === spf.SPF_PASS) ? ' designates ' : ' does not designate ') +
        connection.remote.ip + ' as permitted sender) ' + [
            'receiver=' + plugin.config.get('me'),
            'identity=' + id,
            'client-ip=' + (ip ? ip : connection.remote.ip),
            'helo=' + connection.hello.host,
            'envelope-from=<' + mfrom + '>'
        ].join('; ')
    );
};
