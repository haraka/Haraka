// validate an email address is local, using qmail-deliverabled

var http = require('http');
var querystring = require('querystring');

var options = {
    method: 'get',
    host: '127.0.0.1',
    port: 8898,
};

exports.hook_mail = function(next, connection, params) {
    var plugin = this;
    plugin.cfg = plugin.config.get('rcpt_to.qmail_deliverable.ini');

    if (!plugin.cfg.main.check_outbound) { return next(); }
    if (!connection.relaying) { return next(); }

    // GOAL: assure the MAIL FROM domain is local
    var results = connection.transaction.results;

    var email = params[0].address();
    if (!email) {     // likely an IP with relaying permission
        results.add(plugin, {skip: 'null sender', emit: true});
        return next();
    }

    var domain = params[0].host.toLowerCase();

    var cb = function (err, qmd_r) {
        if (err) {
            results.add(plugin, {err: err});
            return next(DENYSOFT, err);
        }

        if (qmd_r[0] === undefined) {
            results.add(plugin, {err: qmd_r[1]});
            return next();
        }
        if (qmd_r[0] === OK) {
            results.add(plugin, {pass: qmd_r[1]});
            return next();
        }
        results.add(plugin, {fail: qmd_r[1]});
        return next(qmd_r[0], qmd_r[1]);
    };

    plugin.get_qmd_response(connection, domain, email, cb);
};

exports.hook_rcpt = function(next, connection, params) {
    var plugin = this;
    var results = connection.transaction.results;

    if (connection.relaying) {
        results.add(plugin, {skip: "relay"});
        return next();
    }

    var rcpt = params[0];
    var domain = rcpt.host.toLowerCase();

    connection.transaction.results.add(plugin, {
        msg: "sock: " + options.host + ':' + options.port
    });

    var cb = function (err, qmd_r) {
        if (err) {
            results.add(plugin, {err: err});
            return next(DENYSOFT, "error validating email address");
        }
        if (qmd_r[0] === undefined) {
            results.add(plugin, {err: qmd_r[1]});
            return next();
        }
        if (qmd_r[0] === OK) {
            results.add(plugin, {pass: qmd_r[1]});
            return next(OK);
        }
        results.add(plugin, {fail: qmd_r[1]});
        return next(qmd_r[0], qmd_r[1]);
    };

    // Qmail::Deliverable::Client does a rfc2822 "atext" test
    // but Haraka has already validated for us by this point
    plugin.get_qmd_response(connection, domain, rcpt.address(), cb);
};

exports.get_qmd_response = function (connection, domain, email, cb) {
    var plugin = this;

    if (plugin.cfg[domain]) {
        if (plugin.cfg[domain].host) options.host = plugin.cfg[domain].host;
        if (plugin.cfg[domain].port) options.host = plugin.cfg[domain].port;
    }
    else {
        if (plugin.cfg.main.host) options.host = plugin.cfg.main.host;
        if (plugin.cfg.main.port) options.port = plugin.cfg.main.port;
    }

    connection.logdebug(plugin, "checking " + email);
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
            cb(undefined, arr);

        });
    }).on('error', function(e) {
        return cb(e);
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
