'use strict';
// validate an email address is local, using qmail-deliverabled

var http = require('http');
var querystring = require('querystring');

var options = {
    method: 'get',
    host: '127.0.0.1',
    port: 8898,
};

exports.register = function () {
    var plugin = this;
    var load_config = function () {
        plugin.cfg = plugin.config.get('rcpt_to.qmail_deliverable.ini', load_config);
    };
    load_config();
};

exports.hook_mail = function(next, connection, params) {
    var plugin = this;

    if (!plugin.cfg.main.check_outbound) { return next(); }

    // determine if MAIL FROM domain is local
    var txn = connection.transaction;

    var email = params[0].address();
    if (!email) {     // likely an IP with relaying permission
        txn.results.add(plugin, {skip: 'mail_from.null', emit: true});
        return next();
    }

    var domain = params[0].host.toLowerCase();

    var cb = function (err, qmd_r) {
        if (err) {
            txn.results.add(plugin, {err: err});
            return next(DENYSOFT, err);
        }

        // the MAIL FROM sender is verified as a local address
        if (qmd_r[0] === OK) {
            txn.results.add(plugin, {pass: "mail_from." + qmd_r[1]});
            txn.notes.local_sender=true;
            return next();
        }

        if (qmd_r[0] === undefined) {
            txn.results.add(plugin, {err: "mail_from." + qmd_r[1]});
            return next();
        }

        txn.results.add(plugin, {msg: "mail_from." + qmd_r[1]});
        return next(CONT, "mail_from." + qmd_r[1]);
    };

    plugin.get_qmd_response(connection, domain, email, cb);
};

exports.hook_rcpt = function(next, connection, params) {
    var plugin = this;
    var txn = connection.transaction;

    var rcpt = params[0];
    var domain = rcpt.host.toLowerCase();

    txn.results.add(plugin, {
        msg: "sock: " + options.host + ':' + options.port
    });

    var cb = function (err, qmd_r) {
        if (err) {
            txn.results.add(plugin, {err: err});
            return next(DENYSOFT, "error validating email address");
        }

        if (qmd_r[0] === OK) {
            txn.results.add(plugin, {pass: "rcpt." + qmd_r[1]});
            return next(OK);
        }

        // a client with relaying privileges is sending from a local domain.
        // Any RCPT is acceptable.
        if (connection.relaying && txn.notes.local_sender) {
            txn.results.add(plugin, {pass: "relaying local_sender"});
            return next(OK);
        }

        if (qmd_r[0] === undefined) {
            txn.results.add(plugin, {err: "rcpt." + qmd_r[1]});
            return next();
        }

        // no need to DENY[SOFT] for invalid addresses. If no rcpt_to.* plugin
        // returns OK, then the address is not accepted.
        txn.results.add(plugin, {msg: "rcpt." + qmd_r[1]});
        return next(CONT, qmd_r[1]);
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
            return [ DENY, "not local" ];
        case '0':
            return [ DENY, "not deliverable" ];
        default:
            return [ undefined, "unknown rv(" + hexnum + ")" ];
    }
};
