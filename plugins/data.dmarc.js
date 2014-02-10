// DMARC for Haraka  (using Mail::DMARC HTTP service)

var http       = require('http');
var Address    = require('./address').Address;
var addrparser = require('address-rfc2822');

var host = '127.0.0.1';
var port = '8080';

exports.register = function () {
    var plugin = this;

    var config = plugin.config.get('data.dmarc.ini', {
        booleans: [
            '-main.reject',
        ],
    });
    if (config.main.host) { host = config.main.host; }
    if (config.main.port) { port = config.main.port; }
};

exports.assemble_req_body = function (connection) {
    var plugin = this;
    var txn = connection.transaction;
    var body   = {
        source_ip:       connection.remote_ip,
        envelope_to:     txn.rcpt_to[0].host,
        envelope_from:   txn.mail_from.host,
        header_from_raw: txn.header.get('From'),
        dkim:            txn.notes.dkim_results || [],
        spf : [
/* { domain => 'example.com', scope => 'mfrom', result => 'pass' } */
            ],
    };

    if (!body.dkim && !body.dkim.length) {
        body.dkim = [];
        // did SA validate DKIM?
        var sa_tests = connection.transaction.header.get('X-Spam-Tests');
        if (sa_tests && /DKIM_SIGNED/.test(sa_tests)) {
            connection.loginfo(plugin, "SA found DKIM sig!");
            if (/DKIM_VALID_AU/.test(sa_tests)) {
                connection.loginfo(plugin, "SA DKIM passed");
                body.dkim.push({
                    domain: (addrparser.parse(body.header_from_raw))[0].host(),
                    selector: 'spamassassin',
                    result: 'pass',
                });
            }
        }
    }

    // SPF mfrom
    if (connection.transaction) {
        var mf_spf = connection.transaction.results.get('spf');
        if (mf_spf) body.spf.push({
            scope: 'mfrom', result: mf_spf.result, domain: mf_spf.domain,
        });
    }

    // SPF helo
    var h_spf = connection.results.get('spf');
    if (h_spf) body.spf.push({
        scope: 'helo', result: h_spf.result, domain: h_spf.domain,
    });

    return body;
};

function get_md_request (md_string) {
    return {
        host: host,
        port: port,
        method: 'POST',
        path: '/dmarc/json/validate',
        headers: {
            'Content-Type': 'application/json; charset=utf-8',
            'Content-Length': Buffer.byteLength(md_string),
        }
    };
}

exports.hook_data_post = function (next, connection) {
    var plugin = this;

    var md_request = plugin.assemble_req_body(connection);
    var md_string = JSON.stringify(md_request);
    connection.loginfo(plugin, "body: " + md_string);

    var mail_dmarc_err = function(res) {
        if (connection.transaction) {
            // connection.loginfo(plugin, res);
            connection.transaction.results.add(plugin, {err: res.statusCode});
        }
        else {
            connection.logerror(plugin, res.statusCode);
        }
        return next();
    };

    var mail_dmarc_handler = function (res) {
        if (res.statusCode !== 200) { return mail_dmarc_err(res); }
        connection.logprotocol(plugin, 'STATUS: ' + res.statusCode);
        connection.logprotocol(plugin, 'HEADERS: ' + JSON.stringify(res.headers));
        res.setEncoding('utf8');
        res.on('data', function (chunk) {
            connection.loginfo(plugin,'BODY: ' + chunk);
            var resObj;
            try { resObj = JSON.parse(chunk); }
            catch (e) {
                connection.logerror("error parsing JSON chunk: " + e);
                return;
            }

            var auth_pub = '';
            if (resObj.published) {
                auth_pub = " (p=" + resObj.published.p + " d=" + resObj.published.domain + ')';
            }

            if (!connection.transaction) { return next(); }
            connection.transaction.results.add(plugin, {
                dmarc:       resObj.result,
                disposition: resObj.disposition,
            });
            if (resObj.dkim) {
                connection.transaction.results.add(plugin, { dkim: resObj.dkim });
            }
            if (resObj.spf) {
                connection.transaction.results.add(plugin, { spf: resObj.spf });
            }

            if (resObj.result === 'pass') {
                connection.transaction.results.add(plugin, {pass: auth_pub});
                connection.auth_results('dmarc=pass' + auth_pub);
                return next();
            }

            // failed DMARC
            if (resObj.published) { connection.auth_results('dmarc=fail' + auth_pub); }
            if (resObj.reason) {
                for (var j=0; j < resObj.reason.length; j++) {
                    connection.transaction.results.add(plugin, {
                        msg: resObj.reason[j].type + ':' + resObj.reason[j].comment,
                    });
                }
            }

            return next();
        });
    };

    var req = http.request(get_md_request(md_string), mail_dmarc_handler);
    req.on('error', function(e) {
        connection.logdebug(plugin, "error: "+e);
        return next();
    });

    req.end(md_string);
};
