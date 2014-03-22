// spf

var SPF = require('./spf').SPF;
var net_utils = require('./net_utils');

// Override logging in SPF module
var plugin = exports;
SPF.prototype.log_debug = function (str) {
    return plugin.logdebug(str);
};

exports.hook_helo = exports.hook_ehlo = function (next, connection, helo) {
    var plugin = this;
    plugin.cfg = plugin.config.get('spf.ini', {
        booleans: [
            '-main.helo_softfail_reject',
            '-main.helo_fail_reject',
            '-main.helo_temperror_defer',
            '-main.helo_permerror_reject',

            '-main.mail_softfail_reject',
            '-main.mail_fail_reject',
            '-main.mail_temperror_defer',
            '-main.mail_permerror_reject',
        ]
    });
    // Bypass private IPs
    if (net_utils.is_rfc1918(connection.remote_ip)) return next();
    var timeout = false;
    var spf = new SPF();
    var timer = setTimeout(function () {
        timeout = true;
        connection.logerror(plugin, 'timeout');
        return next();
    }, 30 * 1000);
    spf.hello_host = helo;
    spf.check_host(connection.remote_ip, helo, null, function (err, result) {
        if (timer) clearTimeout(timer);
        if (timeout) return;
        if (err) {
            connection.logerror(plugin, err);
            return next();
        }
        var host = connection.hello_host;
        plugin.log_result(connection, 'helo', host, 'postmaster@' + host, spf.result(result));

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
    // Bypass private IPs
    if (net_utils.is_rfc1918(connection.remote_ip)) return next();

    var txn = connection.transaction;
    if (!txn) return next();

    var mfrom = params[0].address();
    var host = params[0].host;
    var spf = new SPF();

    if (connection.notes.spf_helo) {
        var h_result = connection.notes.spf_helo;
        var h_host = connection.hello_host;
        plugin.save_to_header(connection, spf, h_result, mfrom, h_host, 'helo');
        if (!host) {   // Use results from HELO if the return-path is null
            var auth_result = spf.result(h_result).toLowerCase();
            connection.auth_results( "spf="+auth_result+" smtp.helo=" + h_host);

            var sender = '<> via ' + h_host;
            return plugin.return_results(next, connection, spf, 'helo', h_result, sender);
        }
    }

    if (!host) return next();  // null-sender

    var timeout = false;
    var timer = setTimeout(function () {
        timeout = true;
        connection.logerror(plugin, 'timeout');
        return next();
    }, 30 * 1000);

    spf.helo = connection.hello_host;
    spf.check_host(connection.remote_ip, host, mfrom, function (err, result) {
        if (timer) clearTimeout(timer);
        if (timeout) return;
        if (err) {
            connection.logerror(plugin, err);
            return next();
        }
        plugin.log_result(connection, 'mfrom', host, mfrom, spf.result(result));
        plugin.save_to_header(connection, spf, result, mfrom, host, 'mailfrom');

        var auth_result = spf.result(result).toLowerCase();
        connection.auth_results( "spf="+auth_result+" smtp.mailfrom="+host);

        txn.notes.spf_mail_result = spf.result(result);
        txn.notes.spf_mail_record = spf.spf_record;
        txn.results.add(plugin, {
            scope: 'mfrom',
            result: spf.result(result),
            domain: host,
            emit: true,
        });
        return plugin.return_results(next, connection, spf, 'mail', result, '<'+mfrom+'>');
    });
};

exports.log_result = function (connection, scope, host, mfrom, result) {
    connection.loginfo(this, [
        'identity=' + scope,
        'ip=' + connection.remote_ip,
        'domain="' + host + '"',
        'mfrom=<' + mfrom + '>',
        'result=' + result
        ].join(' '));
};

exports.return_results = function(next, connection, spf, scope, result, sender) {
    var plugin = this;
    var msgpre = 'sender ' + sender;

    switch (result) {
        case spf.SPF_NONE:
        case spf.SPF_NEUTRAL:
        case spf.SPF_PASS:
            return next();
        case spf.SPF_SOFTFAIL:
            if (plugin.cfg.main[scope + '_softfail_reject']) {
                return next(DENY, msgpre + ' SPF SoftFail');
            }
            return next();
        case spf.SPF_FAIL:
            if (plugin.cfg.main[scope + '_fail_reject']) {
                return next(DENY, msgpre + ' SPF Fail');
            }
            return next();
        case spf.SPF_TEMPERROR:
            if (plugin.cfg.main[scope + '_temperror_defer']) {
                return next(DENYSOFT, msgpre + ' SPF Temporary Error');
            }
            return next();
        case spf.SPF_PERMERROR:
            if (plugin.cfg.main[scope + '_permerror_reject']) {
                return next(DENY, msgpre + ' SPF Permanent Error');
            }
            return next();
        default:
            // Unknown result
            connection.logerror(plugin, 'unknown result code=' + result);
            return next();
    }
};

exports.save_to_header = function (connection, spf, result, mfrom, host, id) {
    var plugin = this;
    // Add a trace header
    if (!connection) return;
    if (!connection.transaction) return;
    connection.transaction.add_leading_header('Received-SPF',
        spf.result(result) +
        ' (' + plugin.config.get('me') + ': domain of ' + host +
        ((result === spf.SPF_PASS) ? ' designates ' : ' does not designate ') +
        connection.remote_ip + ' as permitted sender) ' + [
            'receiver=' + plugin.config.get('me'),
            'identity=' + id,
            'client-ip=' + connection.remote_ip,
            'helo=' + connection.hello_host,
            'envelope-from=<' + mfrom + '>'
        ].join('; ')
    );
};
