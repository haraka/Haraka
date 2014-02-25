// validate an email address is local, using qmail-deliverabled

var http = require('http');
var querystring = require('querystring');

var options = {
    method: 'get',
};

exports.register = function() {
    this.register_hook('rcpt', 'rcpt_to_qmd');
};

exports.rcpt_to_qmd = function(next, connection, params) {
    var plugin = this;
    var config = plugin.config.get('rcpt_to.qmail_deliverable.ini');

    options.host = config.main.host || '127.0.0.1';
    options.port = config.main.port || 8998;
    this.logdebug(connection, "host: " + options.host );
    this.logdebug(connection, "port: " + options.port );

    var rcpt = params[0];
    var email = rcpt.address();

    // Qmail::Deliverable::Client does a rfc2822 "atext" test
    // but Haraka has already validated for us by this point

    connection.logdebug(plugin, "checking " + email );
    return plugin.get_qmd_response(next, connection, email);
}

exports.get_qmd_response = function (next, conn, email) {
    var plugin = this;
    var results = conn.transaction.results;
    options.path = '/qd1/deliverable?' + querystring.escape(email);
    plugin.logprotocol(conn, 'PATH: ' + options.path);
    var req = http.get(options, function(res) {
        plugin.logprotocol(conn, 'STATUS: ' + res.statusCode);
        plugin.logprotocol(conn, 'HEADERS: ' + JSON.stringify(res.headers));
        res.setEncoding('utf8');
        res.on('data', function (chunk) {
            plugin.logprotocol(conn, 'BODY: ' + chunk);
            var hexnum = new Number(chunk).toString(16);
            var arr = check_qmd_reponse(next,plugin,conn,hexnum);
            conn.loginfo(plugin, arr[1]);
            if (arr[0] === undefined) {
                results.add(plugin, {err: arr[1]});
                return next();
            }
            if (arr[0] === OK) {
                results.add(plugin, {pass: arr[1]});
                return next(OK);
            }
            results.add(plugin, {fail: arr[1]});
            return next(arr[0], arr[1]);
        });
    }).on('error', function(e) {
        results.add(plugin, {err: e.message});
    });
};

function check_qmd_reponse(next,plugin,conn,hexnum) {
    plugin.logprotocol(conn,"HEXRV: " + hexnum );

    switch(hexnum) {
        case '11':
            return [ DENYSOFT, "permission failure" ];
        case '12':
            return [ OK, "qmail-command in dot-qmail"];
        case '13':
            return [ OK, "bouncesaying with program"];
        case '14':
            var from = conn.transaction.mail_from.address();
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
        case '00':
            return [ DENY, "not deliverable" ];
        default:
            return [ undefined, "unknown rv(" + hexnum + ")" ];
    }
}
