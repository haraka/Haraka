'use strict';

var http = require('http');

exports.register = function () {
    this.load_rspamd_ini();
};

exports.load_rspamd_ini = function () {
    var plugin = this;

    plugin.cfg = plugin.config.get('rspamd.ini', {
        booleans: [
            '+main.reject',
            '-main.always_add_headers',
        ],
    }, function () {
        plugin.load_rspamd_ini();
    });

    if (!plugin.cfg.main.reject_message) {
        plugin.cfg.main.reject_message = 'Detected as spam';
    }

    if (!plugin.cfg.main.port) plugin.cfg.main.port = 11333;
    if (!plugin.cfg.main.host) plugin.cfg.main.host = 'localhost';
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

    if (connection.remote_ip) options.headers.IP = connection.remote_ip;

    var fcrdns = connection.results.get('connect.fcrdns');
    if (fcrdns && fcrdns.fcrdns) {
        options.headers.Hostname = fcrdns.fcrdns[0];
    }
    else {
        if (connection.remote_host) {
            options.headers.Hostname = connection.remote_host;
        }
    }

    if (connection.hello_host) options.headers.Helo = connection.hello_host;

    if (connection.notes.auth_user) {
        options.headers.User = connection.notes.auth_user;
    }

    if (connection.transaction.mail_from) {
        options.headers.From =
            connection.transaction.mail_from.address().toString();
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
    var cfg = plugin.cfg.main;
    var options = plugin.get_options(connection);

    var req;
    var rawData = '';
    var start = Date.now();
    connection.transaction.message_stream.pipe(
        req = http.request(options, function (res) {
            res.on('data', function (chunk) { rawData += chunk; });
            res.on('end', function () {
                var data = plugin.parse_response(rawData, connection);
                if (!data) return next();

                data.emit = true; // spit out a log entry
                connection.transaction.results.add(plugin, data);
                connection.transaction.results.add(plugin, {
                    time: (Date.now() - start)/1000,
                });

                if (data.action === 'reject') {
                    if (!cfg.reject) return next();
                    return next(DENY, cfg.reject_message);
                }

                if (data.action === 'add header' || cfg.always_add_headers) {
                    plugin.add_headers(connection, data);
                }

                return next();
            });
        })
    );

    req.on('error', function (err) {
        connection.logerror('Rspamd query failed: ' + err.message);
        return next();
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

    // copy those nested objects into a higher level object
    var dataClean = {};
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

    return dataClean;
};

exports.add_headers = function (connection, data) {
    var plugin = this;
    var cfg = plugin.cfg.main;

    if (cfg.header_bar) {
        var spamBar = '';
        var spamBarScore = data.score;
        if (data.score === 0) {
            spamBar = cfg.spambar_neutral || '/';
        }
        else {
            var spamBarChar;
            if (data.score > 0) {
                spamBarChar = cfg.spambar_positive || '+';
            }
            else {
                spamBarScore = spamBarScore * -1;
                spamBarChar = cfg.spambar_negative || '-';
            }
            for (var i = 0; i < data.score; i++) {
                spamBar += spamBarChar;
            }
        }
        connection.transaction.remove_header(cfg.header_bar);
        connection.transaction.add_header(cfg.header_bar, spamBar);
    }

    if (cfg.header_report) {
        var prettySymbols = [];
        for (var k in data) {
            if (data[k].score) {
                prettySymbols.push(data[k].name +
                    '(' + data[k].score + ')');
            }
        }
        connection.transaction.remove_header(cfg.header_report);
        connection.transaction.add_header(cfg.header_report,
            prettySymbols.join(' '));
    }

    if (cfg.header_score) {
        connection.transaction.remove_header(cfg.header_score);
        connection.transaction.add_header(cfg.header_score, '' + data.score);
    }
};
