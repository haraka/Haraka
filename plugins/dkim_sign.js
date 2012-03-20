// dkim_signer
// Implements DKIM core as per www.dkimcore.org

var crypto = require('crypto');

exports.hook_queue_outbound = function (next, connection) {
    var transaction = connection.transaction;
    var config = this.config.get('dkim_sign.ini');
    var private_key = this.config.get('dkim.private.key','data').join("\n");
    var headers_to_sign = [];

    // Make sure we have all the relevant configuration
    if (!private_key) {
        connection.logerror(this, 'skipped: missing dkim.private.key');
        return next();
    }
    if (config.main.disabled && /(?:1|true|y[es])/i.test(config.main.disabled)) {
        connection.logerror(this, 'skipped: disabled');
        return next();
    }
    if (!config.main.selector) {
        connection.logerror(this, 'skipped: missing selector');
        return next();
    }
    if (!config.main.domain) {
        connection.logerror(this, 'skipped: missing domain');
        return next();
    }
    if (config.main.headers_to_sign) {
        headers_to_sign = config.main.headers_to_sign
                          .toLowerCase()
                          .replace(/\s+/g,'')
                          .split(/[,;:]/);
    }
    // From MUST be present
    if (headers_to_sign.indexOf('from') === -1) {
        headers_to_sign.push('from');
    }

    /*
    ** BODY (simple canonicalization)
    */
    var data_marker = 0;
    var found_body = false;
    var buffer = "";
    var hash = crypto.createHash('SHA256');
    while (data_marker < transaction.data_lines.length) {
        var line = transaction.data_lines[data_marker];
        line = line.replace(/\r?\n/g, "\r\n");
        // Skip until we find the end-of-headers
        if (!found_body) {
            if (line === "\r\n") {
                found_body = true;
            }
            data_marker++;
            continue;
        }
        if (line === "\r\n") {
            // Buffer any empty lines so we can discard
            // and trailing CRLFs at the end of the message.
            buffer += line;
        }
        else {
            if (buffer) {
                hash.update(buffer);
                buffer = "";
            }
            hash.update(line, 'ascii');
        }
        data_marker++;
    }
    // Add trailing CRLF if it was missing from the last line
    if (line.slice(-2) !== "\r\n") {
        hash.update("\r\n", 'ascii');
    }
    var bodyhash = hash.digest('base64');

    /*
    ** HEADERS (relaxed canonicaliztion)
    */
    var headers = [];
    var signer = crypto.createSign('RSA-SHA256');
    for (var i=0; i < headers_to_sign.length; i++ ) {
        var head = transaction.header.get(headers_to_sign[i]);
        if (head) {
            head = head.replace(/\r?\n/gm, '');
            head = head.replace(/\s+/gm, ' ');
            head = head.replace(/\s+$/gm, '');
            signer.update(headers_to_sign[i] + ':' + head + "\r\n");
            headers.push(headers_to_sign[i]);
        }
    };
    var dkim_header = 'v=1;a=rsa-sha256;bh=' + bodyhash + 
                      ';c=relaxed/simple;d=fsl.com;h=' + headers.join(':') + 
                      ';s=mail;b=';
    signer.update('dkim-signature:' + dkim_header);
    var signature = signer.sign(private_key, 'base64');
    dkim_header += signature;
    transaction.add_header('DKIM-Signature', dkim_header);
    connection.loginfo(this, 'added DKIM signature');

    return next();
}
