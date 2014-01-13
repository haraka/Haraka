// spf

var SPF = require('./spf').SPF;
var net_utils = require('./net_utils');

// Override logging in SPF module
var plugin = exports;
SPF.prototype.log_debug = function (str) {
    return plugin.logdebug(str);
}

exports.hook_helo = exports.hook_ehlo = function (next, connection, helo) {
    // Bypass private IPs
    if (net_utils.is_rfc1918(connection.remote_ip)) return next();
    var self = this;
    var timeout = false;
    var spf = new SPF();
    var timer = setTimeout(function () {
        timeout = true;
        connection.logerror(self, 'timeout');
        return next();
    }, 30 * 1000);
    spf.hello_host = helo;
    spf.check_host(connection.remote_ip, helo, null, function (err, result) {
        if (timer) clearTimeout(timer);
        if (timeout) return;
        if (err) {
            connection.logerror(self, err);
            return next();
        }
        connection.loginfo(self, [
            'identity=helo',
            'ip=' + connection.remote_ip,
            'domain="' + connection.hello_host + '"',
            'mfrom=<' + 'postmaster@' + connection.hello_host + '>',
            'result=' + spf.result(result),
            ].join(' '));
        connection.notes.spf_helo = result;
        return next();
    });
}

exports.hook_mail = function (next, connection, params) {
    var txn = connection.transaction;
    if (!txn) return next();

    // Bypass private IPs
    if (net_utils.is_rfc1918(connection.remote_ip)) return next();
    var cfg = this.config.get('spf.ini');

    var self = this;
    var mfrom = params[0].address();
    var host = params[0].host;
    var spf = new SPF();
    var auth_result;

    if (connection.notes.spf_helo) {
        auth_result = spf.result(connection.notes.spf_helo).toLowerCase;
        // Add a trace header
        txn.add_leading_header('Received-SPF', 
            spf.result(connection.notes.spf_helo) +
            ' (' + self.config.get('me') + ': domain of ' + connection.hello_host +
            ((connection.notes.spf_helo === spf.SPF_PASS) ? ' designates ' : ' does not designate ') +
            connection.remote_ip + ' as permitted sender) ' + [
                'receiver=' + self.config.get('me'),
                'identity=helo',
                'client-ip=' + connection.remote_ip,
                'helo=' + connection.hello_host,
                'envelope-from=<' + mfrom + '>',
            ].join('; '));
        // Use the result from HELO if the return-path is null
        if (!host) {
            connection.auth_results( "spf="+auth_result+" smtp.helo="+connection.hello_host);
            switch (connection.notes.spf_helo) {
                case spf.SPF_NONE:
                case spf.SPF_NEUTRAL:
                case spf.SPF_PASS:
                    return next();
                case spf.SPF_SOFTFAIL:
                    if (cfg.main.helo_softfail_reject) {
                        return next(DENY, 'sender <> via ' + connection.hello_host +
                                          ' SPF SoftFail');
                    }
                    return next();
                case spf.SPF_FAIL:
                    if (cfg.main.helo_fail_reject) {
                        return next(DENY, 'sender <> via ' + connection.hello_host + 
                                          ' SPF Fail');
                    }
                    return next();
                case spf.SPF_TEMPERROR:
                    if (cfg.main.helo_temperror_defer) {
                        return next(DENYSOFT, 'sender <> via ' + connection.hello_host + 
                                              ' SPF Temporary Error');
                    }
                    return next();
                case spf.SPF_PERMERROR:
                    if (cfg.main.helo_permerror_reject) {
                        return next(DENY, 'sender <> via ' + connection.hello_host + 
                                          ' SPF Permanent Error');
                    }
                    return next();
                default:
                    // Unknown result
                    connection.logerror(self, 'unknown result code=' + result);
                    return next();
            }
        }
    }

    if (!host) return next();  // null-sender

    var timeout = false;
    var timer = setTimeout(function () {
        timeout = true;
        connection.logerror(self, 'timeout');
        return next();
    }, 30 * 1000);

    spf.helo = connection.hello_host;
    spf.check_host(connection.remote_ip, host, mfrom, function (err, result) {
        if (timer) clearTimeout(timer);
        if (timeout) return;
        if (err) {
            connection.logerror(self, err);
            return next();
        }
        connection.loginfo(self, [
            'identity=mfrom',
            'ip=' + connection.remote_ip,
            'domain="' + host + '"',
            'mfrom=<' + mfrom + '>',
            'result=' + spf.result(result)
            ].join(' '));
        // Add a trace header
        txn.add_leading_header('Received-SPF', 
            spf.result(result) +
            ' (' + self.config.get('me') + ': domain of ' + host +
            ((result === spf.SPF_PASS) ? ' designates ' : ' does not designate ') +
            connection.remote_ip + ' as permitted sender) ' + [
                'receiver=' + self.config.get('me'),
                'identity=mailfrom',
                'client-ip=' + connection.remote_ip,
                'helo=' + connection.hello_host,
                'envelope-from=<' + mfrom + '>',
            ].join('; '));
        auth_result = spf.result(result).toLowerCase();
        connection.auth_results( "spf="+auth_result+" smtp.mailfrom="+host);
        txn.notes.spf_mail_result = spf.result(result);
        txn.notes.spf_mail_record = spf.spf_record;
        switch (result) {
            case spf.SPF_NONE:
            case spf.SPF_NEUTRAL:
            case spf.SPF_PASS:
                return next();
            case spf.SPF_SOFTFAIL:
                if (cfg.main.mail_softfail_reject) {
                    return next(DENY, 'sender <' + mfrom + '> SPF SoftFail');
                }
                return next();
            case spf.SPF_FAIL:
                if (cfg.main.mail_fail_reject) {
                    return next(DENY, 'sender <' + mfrom + '> SPF Fail');
                }
                return next();
            case spf.SPF_TEMPERROR:
                if (cfg.main.mail_temperror_defer) {
                    return next(DENYSOFT, 'sender <' + mfrom + '> SPF Temporary Error');
                }
                return next();
            case spf.SPF_PERMERROR:
                if (cfg.main.mail_permerror_reject) {
                    return next(DENY, 'sender <' + mfrom + '> SPF Permanent Error');
                }
                return next();
            default:
                // Unknown result
                connection.logerror(self, 'unknown result code=' + result);
                return next();
        }
    });
}
