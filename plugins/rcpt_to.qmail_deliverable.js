// validate an email address is local, using qmail-deliverabled

var http = require('http');
var querystring = require('querystring');

var options = {
    method: 'get',
}

exports.register = function() {
    this.register_hook('rcpt', 'rcpt_to_qmd');
};

exports.rcpt_to_qmd = function(next, connection, params) {
    var config = this.config.get('rcpt_to.qmail_deliverable.ini');

    options.host = config.main.host || '127.0.0.1';
    options.port = config.main.port || 8998;
    this.logdebug(connection, "host: " + options.host );
    this.logdebug(connection, "port: " + options.port );

    var rcpt = params[0];
    var email = rcpt.address();

    // TODO: this is a good place to validate email
    // Qmail::Deliverable::Client does a rfc2822 "atext" test
    // but Haraka might have done this for us, at this point?

    this.logdebug(connection, "checking " + email );
    return get_qmd_response(next,this,connection,email);
}

function get_qmd_response(next,plugin,conn,email) {
    options.path = '/qd1/deliverable?' + querystring.escape(email);
    plugin.logprotocol(conn, 'PATH: ' + options.path);
    var req = http.get(options, function(res) {
        plugin.logprotocol(conn, 'STATUS: ' + res.statusCode);
        plugin.logprotocol(conn, 'HEADERS: ' + JSON.stringify(res.headers));
        res.setEncoding('utf8');
        res.on('data', function (chunk) {
            plugin.logprotocol(conn, 'BODY: ' + chunk);
            var hexnum = new Number(chunk).toString(16);
            return check_qmd_reponse(next,plugin,conn,hexnum);
        });
    }).on('error', function(e) {
        plugin.loginfo(conn, "Got error: " + e.message);
    });
};

function check_qmd_reponse(next,plugin,conn,hexnum) {
    plugin.logprotocol(conn,"HEXRV: " + hexnum );

    switch(hexnum) {
        case '11':
            plugin.loginfo(conn, "error, permission failure");
            return next();
        case '12':
            plugin.loginfo(conn, "pass, qmail-command in dot-qmail");
            return next(OK);
        case '13':
            plugin.loginfo(conn, "pass, bouncesaying with program");
            return next(OK);
        case '14':
            var from = conn.transaction.mail_from.address();
            if ( ! from || from === '<>') {
                return next(DENY, "fail, mailing lists do not accept null senders");
            }
            plugin.loginfo(conn, "pass, ezmlm list");
            return next(OK);
        case '21':
            plugin.loginfo(conn, "Temporarily undeliverable: group/world writable");
            return next();
        case '22':
            plugin.loginfo(conn, "Temporarily undeliverable: sticky home directory");
            return next();
        case '2f':
            plugin.loginfo(conn, "error communicating with qmail-deliverabled.");
            return next();
        case 'f1':
            plugin.loginfo(conn, "pass, normal delivery");
            return next(OK);
        case 'f2':
            plugin.loginfo(conn, "pass, vpopmail dir");
            return next(OK);
        case 'f3':
            plugin.loginfo(conn, "pass, vpopmail alias");
            return next(OK);
        case 'f4':
            plugin.loginfo(conn, "pass, vpopmail catchall");
            return next(OK);
        case 'f5':
            plugin.loginfo(conn, "pass, vpopmail vuser");
            return next(OK);
        case 'f6':
            plugin.loginfo(conn, "pass, vpopmail qmail-ext");
            return next(OK);
        case 'fe':
            plugin.loginfo(conn, "error, SHOULD NOT HAPPEN");
            return next();
        case 'ff':
            plugin.loginfo(conn, "fail, address not local");
            return next();
        default:
            plugin.loginfo(conn, "error, unknown rv: " + hexnum);
            return next();
    }
};
