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
    return get_qmd_response(next,this,connection,email);
}

function get_qmd_response(next,plugin,connection,email) {
    options.path = '/qd1/deliverable?' + email;
    plugin.logprotocol('PATH: ' + options.path);
    var req = http.get(options, function(res) {
        plugin.logprotocol('STATUS: ' + res.statusCode);
        plugin.logprotocol('HEADERS: ' + JSON.stringify(res.headers));
        res.on('data', function (chunk) {
            res.setEncoding('utf8');
            plugin.logprotocol('BODY: ' + chunk);
            var hexnum = new Number(chunk).toString(16);
            return check_qmd_reponse(next,plugin,connection,hexnum);
        });
    }).on('error', function(e) {
        plugin.loginfo("Got error: " + e.message);
    });
};

function check_qmd_reponse(next,plugin,connection,hexnum) {
    plugin.logprotocol("HEXRV: " + hexnum );

    switch(hexnum) {
        case '11':
            plugin.loginfo("error, permission failure");
            return next();
        case '12':
            plugin.loginfo("pass, qmail-command in dot-qmail");
            return next(OK);
        case '13':
            plugin.loginfo("pass, bouncesaying with program");
            return next(OK);
        case '14':
            var from = connection.transaction.mail_from.address();
            if ( ! from || from === '<>') {
                return next(DENY, "fail, mailing lists do not accept null senders");
            }
            plugin.loginfo("pass, ezmlm list");
            return next(OK);
        case '21':
            plugin.loginfo("Temporarily undeliverable: group/world writable");
            return next();
        case '22':
            plugin.loginfo("Temporarily undeliverable: sticky home directory");
            return next();
        case '2f':
            plugin.loginfo("error communicating with qmail-deliverabled.");
            return next();
        case 'f1':
            plugin.loginfo("pass, normal delivery");
            return next(OK);
        case 'f2':
            plugin.loginfo("pass, vpopmail dir");
            return next(OK);
        case 'f3':
            plugin.loginfo("pass, vpopmail alias");
            return next(OK);
        case 'f4':
            plugin.loginfo("pass, vpopmail catchall");
            return next(OK);
        case 'f5':
            plugin.loginfo("pass, vpopmail vuser");
            return next(OK);
        case 'f6':
            plugin.loginfo("pass, vpopmail qmail-ext");
            return next(OK);
        case 'fe':
            plugin.loginfo("error, SHOULD NOT HAPPEN");
            return next();
        case 'ff':
            plugin.loginfo("fail, address not local");
            return next();
        default:
            plugin.loginfo("error, unknown rv: " + hexnum);
            return next();
    }
};
