// validate an email address is local, using qmail-deliverabled

var http = require('http');

var options = {
    method: 'get',
}

exports.register = function() {
    var config   = this.config.get('rcpt_to.qmail_deliverable.ini');

    options.host = config.main.host || '127.0.0.1';
    options.port = config.main.port || 8998;

    this.logdebug(this, "host: " + options.host );
    this.logdebug(this, "port: " + options.port );

    this.register_hook('rcpt', 'rcpt_to_qmd');
}

exports.rcpt_to_qmd = function(next, connection, params) {
    var rcpt = params[0];
    var email = rcpt.address();

    // TODO: this is a good place to validate email
    // the perl Qmail::Deliverable client does a rfc2822 "atext" test
    // but Haraka might have done this for us, by this point

    this.logdebug("checking " + email );
    return get_qmd_response(next,connection,email);
}

function get_qmd_response(next,conn,email) {
    options.path = '/qd1/deliverable?' + email;
    conn.logprotocol(conn, 'PATH: ' + options.path);
    var req = http.get(options, function(res) {
        conn.logprotocol(conn, 'STATUS: ' + res.statusCode);
        conn.logprotocol(conn, 'HEADERS: ' + JSON.stringify(res.headers));
        res.on('data', function (chunk) {
            res.setEncoding('utf8');
            conn.logprotocol(conn, 'BODY: ' + chunk);
            var hexnum = new Number(chunk).toString(16);
            return check_qmd_reponse( next, conn, hexnum );
        });
    }).on('error', function(e) {
        conn.loginfo(conn,"Got error: " + e.message);
    });
};

function check_qmd_reponse(next,connection,hexnum) {
    connection.logprotocol( "HEXRV: " + hexnum );

    switch(hexnum) {
        case '11':
            connection.loginfo("qmd error, permission failure");
            return next();
            break;
        case '12':
            connection.loginfo("qmd pass, qmail-command in dot-qmail");
            return next(OK);
            break;
        case '13':
            connection.loginfo("qmd pass, bouncesaying with program");
            return next(OK);
            break;
        case '14':
            var from = connection.transaction.mail_from.address();
            if ( ! from || from === '<>') {
                return next(DENY, "fail, mailing lists do not accept null senders");
            }
            connection.loginfo("qmd pass, ezmlm list");
            return next(OK);
            break;
        case '21':
            connection.loginfo("qmd Temporarily undeliverable: group/world writable");
            return next();
            break;
        case '22':
            connection.loginfo("qmd Temporarily undeliverable: sticky home directory");
            return next();
            break;
        case '2f':
            connection.loginfo("qmd error, Qmail::Deliverable::Client::ERROR");
            return next();
            break;
        case 'f1':
            connection.loginfo("qmd pass, normal delivery");
            return next(OK);
            break;
        case 'f2':
            connection.loginfo("qmd pass, vpopmail dir");
            return next(OK);
            break;
        case 'f3':
            connection.loginfo("qmd pass, vpopmail alias");
            return next(OK);
            break;
        case 'f4':
            connection.loginfo("qmd pass, vpopmail catchall");
            return next(OK);
            break;
        case 'f5':
            connection.loginfo("qmd pass, vpopmail vuser");
            return next(OK);
            break;
        case 'f6':
            connection.loginfo("qmd pass, vpopmail qmail-ext");
            return next(OK);
            break;
        case 'fe':
            connection.loginfo("qmd error, SHOULD NOT HAPPEN");
            return next();
            break;
        case 'ff':
            connection.loginfo("qmd fail, address not local");
            return next();
            break;
        default:
            connection.loginfo("qmd error, unknown rv: " + hexnum);
            return next();
    }
};
