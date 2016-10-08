'use strict';

// node built-ins
var http = require('http');

// haraka libs
var DSN = require('./dsn');
var net_utils = require('haraka-net-utils');

exports.register = function () {
    this.load_rspamd_ini();
};

exports.load_rspamd_ini = function () {
    var plugin = this;

    plugin.cfg = plugin.config.get('rspamd.ini', {
        booleans: [
            '-check.authenticated',
            '+dkim.enabled',
            '-check.private_ip',
            '+reject.spam',
            '-reject.authenticated',
            '+rmilter_headers.enabled',
            '+soft_reject.enabled',
        ],
    }, function () {
        plugin.load_rspamd_ini();
    });

    if (!plugin.cfg.reject.message) {
        plugin.cfg.reject.message = 'Detected as spam';
    }

    if (!plugin.cfg.soft_reject.message) {
        plugin.cfg.soft_reject.message = 'Deferred by policy';
    }

    if (!plugin.cfg.spambar) {
        plugin.cfg.spambar = { positive: '+', negative: '-', neutral: '/' };
    }

    if (!plugin.cfg.main.port) plugin.cfg.main.port = 11333;
    if (!plugin.cfg.main.host) plugin.cfg.main.host = 'localhost';

    if (!plugin.cfg.main.add_headers) {
        if (plugin.cfg.main.always_add_headers === true) {
            plugin.cfg.main.add_headers = 'always';
        } else {
            plugin.cfg.main.add_headers = 'sometimes';
        }
    }
};

exports.get_options = function (connection) {
    var plugin = this;

    // https://rspamd.com/doc/architecture/protocol.html
    var options = {
        headers: {},
        port: plugin.cfg.main.port,
        host: plugin.cfg.main.host,
        path: '/check',
        method: 'POST',
    };

    if (connection.notes.auth_user) {
        options.headers.User = connection.notes.auth_user;
    }

    if (connection.remote.ip) options.headers.IP = connection.remote.ip;

    var fcrdns = connection.results.get('connect.fcrdns');
    if (fcrdns && fcrdns.fcrdns && fcrdns.fcrdns[0]) {
        options.headers.Hostname = fcrdns.fcrdns[0];
    }
    else {
        if (connection.remote.host) {
            options.headers.Hostname = connection.remote.host;
        }
    }

    if (connection.hello.host) options.headers.Helo = connection.hello.host;

    if (connection.transaction.mail_from) {
        var mfaddr = connection.transaction.mail_from.address().toString();
        if (mfaddr) {
            options.headers.From = mfaddr;
        }
    }

    var rcpts = connection.transaction.rcpt_to;
    if (rcpts) {
        options.headers.Rcpt = [];
        for (var i=0; i < rcpts.length; i++) {
            options.headers.Rcpt.push(rcpts[i].address());
        }

        // for per-user options
        if (rcpts.length === 1) {
            options.headers['Deliver-To'] = options.headers.Rcpt[0];
        }
    }

    if (connection.transaction.uuid)
        options.headers['Queue-Id'] = connection.transaction.uuid;

    return options;
};

exports.hook_data_post = function (next, connection) {
    if (!connection.transaction) return next();

    var plugin = this;
    var cfg = plugin.cfg;

    var authed = connection.notes.auth_user;
    if (authed && !cfg.check.authenticated) return next();
    if (!cfg.check.private_ip &&
        net_utils.is_private_ip(connection.remote.ip)) {
        return next();
    }

    var timer;
    var timeout = plugin.cfg.main.timeout || plugin.timeout - 1;

    var calledNext=false;
    var callNext = function (code, msg) {
        clearTimeout(timer);
        if (calledNext) return;
        calledNext=true;
        next(code, msg);
    }

    timer = setTimeout(function () {
        connection.transaction.results.add(plugin, {err: 'timeout'});
        callNext();
    }, timeout * 1000);

    var options = plugin.get_options(connection);

    var req;
    var rawData = '';
    var start = Date.now();
    connection.transaction.message_stream.pipe(
        req = http.request(options, function (res) {
            res.on('data', function (chunk) { rawData += chunk; });
            res.on('end', function () {
                var r = plugin.parse_response(rawData, connection);
                if (!r.data) return callNext();
                r.data.emit = true; // spit out a log entry

                if (!connection.transaction) return callNext();
                connection.transaction.results.add(plugin, r.data);
                connection.transaction.results.add(plugin, {
                    time: (Date.now() - start)/1000,
                });

                function no_reject () {
                    if (cfg.dkim.enabled && r.controlData['dkim-signature']) {
                        connection.transaction.add_header('DKIM-Signature', r.controlData['dkim-signature']);
                    }
                    if (cfg.rmilter_headers.enabled && r.controlData.rmilter) {
                        if (r.controlData.rmilter.remove_headers) {
                            Object.keys(r.controlData.rmilter.remove_headers).forEach(function(key) {
                                connection.transaction.remove_header(key);
                            })
                        }
                        if (r.controlData.rmilter.add_headers) {
                            Object.keys(r.controlData.rmilter.add_headers).forEach(function(key) {
                                connection.transaction.add_header(key, r.controlData.rmilter.add_headers[key]);
                            })
                        }
                    }
                    if (cfg.soft_reject.enabled && r.data.action === 'soft reject') {
                        return callNext(DENYSOFT, DSN.sec_unauthorized(cfg.soft_reject.message, 451));
                    } else if (cfg.main.add_headers !== 'never' && (
                               cfg.main.add_headers === 'always' ||
                               (r.data.action === 'add header' && cfg.main.add_headers === 'sometimes'))) {
                        plugin.add_headers(connection, r.data);
                    }
                    return callNext();
                }

                if (r.data.action !== 'reject') return no_reject();

                if (!authed && !cfg.reject.spam) return no_reject();
                if (authed && !cfg.reject.authenticated) return no_reject();
                return callNext(DENY, cfg.reject.message);
            });
        })
    );

    req.on('error', function (err) {
        if (!connection || !connection.transaction) return;
        connection.transaction.results.add(plugin, err.message);
        return callNext();
    });
};

exports.parse_response = function (rawData, connection) {
    var plugin = this;

    try {
        var data = JSON.parse(rawData);
    }
    catch (err) {
        connection.transaction.results.add(plugin, {
            err: 'parse failure: ' + err.message
        });
        return;
    }

    if (Object.keys(data).length === 1 && data.error) {
        connection.transaction.results.add(plugin, {
            err: data.error
        });
        return;
    }

    // copy those nested objects into a higher level object
    var dataClean = {};
    var controlData = {};
    Object.keys(data.default).forEach(function (key) {
        var a = data.default[key];
        switch (typeof a) {
            case 'object':
                // transform { name: KEY, score: VAL } -> { KEY: VAL }
                if (a.name && a.score !== undefined) {
                    dataClean[ a.name ] = a.score;
                    break;
                }
                // unhandled type
                connection.logerror(plugin, a);
                break;
            case 'boolean':
            case 'number':
            case 'string':
                dataClean[key] = a;
                break;
            default:
                connection.loginfo(plugin, "skipping unhandled: " + typeof a);
        }
    });

    // arrays which might be present
    ['urls', 'emails', 'messages'].forEach(function (b) {
        // collapse to comma separated string, so values get logged
        if (data[b] && data[b].length) dataClean[b] = data[b].join(',');
    });

    ['dkim-signature', 'rmilter'].forEach(function (x) {
        if (data[x]) controlData[x] = data[x];
    });

    return {
        'data' : dataClean,
        'controlData' : controlData
    };
};

exports.add_headers = function (connection, data) {
    var plugin = this;
    var cfg = plugin.cfg;

    if (cfg.header && cfg.header.bar) {
        var spamBar = '';
        var spamBarScore = 1;
        var spamBarChar = cfg.spambar.neutral || '/';
        if (data.score >= 1) {
            spamBarScore = data.score;
            spamBarChar = cfg.spambar.positive || '+';
        }
        else if (data.score <= -1) {
            spamBarScore = data.score * -1;
            spamBarChar = cfg.spambar.negative || '-';
        }
        for (var i = 0; i < spamBarScore; i++) {
            spamBar += spamBarChar;
        }
        connection.transaction.remove_header(cfg.header.bar);
        connection.transaction.add_header(cfg.header.bar, spamBar);
    }

    if (cfg.header && cfg.header.report) {
        var prettySymbols = [];
        for (var k in data) {
            if (data[k].score) {
                prettySymbols.push(data[k].name +
                    '(' + data[k].score + ')');
            }
        }
        connection.transaction.remove_header(cfg.header.report);
        connection.transaction.add_header(cfg.header.report,
            prettySymbols.join(' '));
    }

    if (cfg.header && cfg.header.score) {
        connection.transaction.remove_header(cfg.header.score);
        connection.transaction.add_header(cfg.header.score, '' + data.score);
    }
};
