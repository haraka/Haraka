// validate an email address is local, using qmail-deliverabled

var http = require('http');
var querystring = require('querystring');

var options = {
    method: 'get',
    host: '127.0.0.1',
    port: 8898,
};

exports.hook_rcpt = function(next, connection, params) {
    var plugin = this;
    var cfg = plugin.config.get('rcpt_to.qmail_deliverable.ini');

    var rcpt = params[0];
    var domain = rcpt.host.toLowerCase();

    if (cfg[domain]) {
        if (cfg[domain].host) options.host = cfg[domain].host;
        if (cfg[domain].port) options.host = cfg[domain].port;
    }
    else {
        if (cfg.main.host) options.host = cfg.main.host;
        if (cfg.main.port) options.port = cfg.main.port;
    }

    connection.transaction.results.add(plugin, {
        msg: "sock: " + options.host + ':' + options.port
    });

    // Qmail::Deliverable::Client does a rfc2822 "atext" test
    // but Haraka has already validated for us by this point
    return plugin.get_qmd_response(next, connection, rcpt.address());
};

exports.get_qmd_response = function (next, connection, email) {
    var plugin = this;
    connection.logdebug(plugin, "checking " + email);
    var results = connection.transaction.results;
    options.path = '/qd1/deliverable?' + querystring.escape(email);
    // connection.logdebug(plugin, 'PATH: ' + options.path);
    http.get(options, function(res) {
        connection.logprotocol(plugin, 'STATUS: ' + res.statusCode);
        connection.logprotocol(plugin, 'HEADERS: ' + JSON.stringify(res.headers));
        res.setEncoding('utf8');
        res.on('data', function (chunk) {
            connection.logprotocol(plugin, 'BODY: ' + chunk);
            var hexnum = new Number(chunk).toString(16);
            var arr = plugin.check_qmd_reponse(connection, hexnum);
            connection.loginfo(plugin, arr[1]);
            if (arr[0] === undefined) {
                results.add(plugin, {err: arr[1]});
                return next();
            }
            if (arr[0] === OK) {
                results.add(plugin, {pass: arr[1]});
                return next(OK);
            }
            if (connection.relaying) {
                results.add(plugin, {skip: "relaying("+arr[1]+')'});
                return next(OK, arr[1]);
            }
            results.add(plugin, {fail: arr[1]});
            return next(arr[0], arr[1]);
        });
    }).on('error', function(e) {
        results.add(plugin, {err: e.message});
    });
};

exports.check_qmd_reponse = function (connection, hexnum) {
    var plugin = this;
    connection.logprotocol(plugin,"HEXRV: " + hexnum );

    switch(hexnum) {
        case '11':
            return [ DENYSOFT, "permission failure" ];
        case '12':
            return [ OK, "qmail-command in dot-qmail"];
        case '13':
            return [ OK, "bouncesaying with program"];
        case '14':
            var from = connection.transaction.mail_from.address();
            if ( ! from || from === '<>') {
                return [ DENY, "mailing lists do not accept null senders" ];
            }
            return [ OK, "ezmlm list" ];
        case '21':
            return [ DENYSOFT, "Temporarily undeliverable: group/world writable" ];
        case '22':
            return [ DENYSOFT, "Temporarily undeliverable: sticky home directory" ];
        case '2f':
            return [ DENYSOFT, "error communicating with qmail-deliverabled." ];
        case 'f1':
            return [ OK, "normal delivery" ];
        case 'f2':
            return [ OK, "vpopmail dir" ];
        case 'f3':
            return [ OK, "vpopmail alias" ];
        case 'f4':
            return [ OK, "vpopmail catchall" ];
        case 'f5':
            return [ OK, "vpopmail vuser" ];
        case 'f6':
            return [ OK, "vpopmail qmail-ext" ];
        case 'fe':
            return [ DENYSOFT, "SHOULD NOT HAPPEN" ];
        case 'ff':
            return [ DENY, "address not local" ];
        case '0':
            return [ DENY, "not deliverable" ];
        default:
            return [ undefined, "unknown rv(" + hexnum + ")" ];
    }
};
