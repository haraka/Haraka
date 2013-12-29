// dkim_signer
// Implements DKIM core as per www.dkimcore.org

var crypto = require('crypto');
var Stream = require('stream').Stream;
var fs     = require('fs');
var indexOfLF = require('./utils').indexOfLF;
var util  = require('util');
var async = require('async');

function DKIMSignStream(selector, domain, private_key, headers_to_sign, header, end_callback) {
    Stream.call(this);
    this.selector = selector;
    this.domain = domain;
    this.private_key = private_key;
    this.headers_to_sign = headers_to_sign;
    this.header = header;
    this.end_callback = end_callback;
    this.writable = true;
    this.found_eoh = false;
    this.buffer = { ar: [], len: 0 };
    this.hash = crypto.createHash('SHA256');
    this.line_buffer = { ar: [], len: 0 };
    this.signer = crypto.createSign('RSA-SHA256');
}

util.inherits(DKIMSignStream, Stream);

DKIMSignStream.prototype.write = function (buf) {
    /*
    ** BODY (simple canonicalization)
    */

    // Merge in any partial data from last iteration
    if (this.buffer.ar.length) {
        this.buffer.ar.push(buf);
        this.buffer.len += buf.length;
        var nb = Buffer.concat(this.buffer.ar, this.buffer.len);
        buf = nb;
        this.buffer = { ar: [], len: 0 };
    }
    // Process input buffer into lines
    var offset = 0;
    while ((offset = indexOfLF(buf)) !== -1) {
        var line = buf.slice(0, offset+1);
        if (buf.length > offset) {
            buf = buf.slice(offset+1);
        }
        // Look for CRLF
        if (line.length === 2 && line[0] === 0x0d && line[1] === 0x0a) {
            // Look for end of headers marker
            if (!this.found_eoh) {
                this.found_eoh = true;
            }
            else {
                // Store any empty lines so that we can discard
                // any trailing CRLFs at the end of the message
                this.line_buffer.ar.push(line);
                this.line_buffer.len += line.length;
            }
        }
        else {
            if (!this.found_eoh) continue; // Skip headers
            if (this.line_buffer.ar.length) {
                // We need to process the buffered CRLFs
                var lb = Buffer.concat(this.line_buffer.ar, this.line_buffer.len);
                this.line_buffer = { ar: [], len: 0 };
                this.hash.update(lb);
            }
            this.hash.update(line);
        }
    }
    if (buf.length) {
        // We have partial data...
        this.buffer.ar.push(buf);
        this.buffer.len += buf.length;
    }
}

DKIMSignStream.prototype.end = function (buf) {
    this.writable = false;

    // Add trailing CRLF if we have data left over
    if (this.buffer.ar.length) {
        this.buffer.ar.push("\r\n");
        this.buffer.len += 2;
        var le = Buffer.concat(this.buffer.ar, this.buffer.len);
        this.hash.update(le);
        this.buffer = { ar: [], len: 0 };
    }

    var bodyhash = this.hash.digest('base64');

    /*
    ** HEADERS (relaxed canonicaliztion)
    */

    var headers = [];
    for (var i=0; i < this.headers_to_sign.length; i++ ) {
        var head = this.header.get(this.headers_to_sign[i]);
        if (head) {
            head = head.replace(/\r?\n/gm, '');
            head = head.replace(/\s+/gm, ' ');
            head = head.replace(/\s+$/gm, '');
            this.signer.update(this.headers_to_sign[i] + ':' + head + "\r\n");
            headers.push(this.headers_to_sign[i]);
        }
    };

    // Create DKIM header
    var dkim_header = 'v=1;a=rsa-sha256;bh=' + bodyhash +
                      ';c=relaxed/simple;d=' + this.domain +
                      ';h=' + headers.join(':') +
                      ';s=' + this.selector +
                      ';b=';
    this.signer.update('dkim-signature:' + dkim_header);
    var signature = this.signer.sign(this.private_key, 'base64');
    dkim_header += signature;

    if (this.end_callback) this.end_callback(null, dkim_header);
    this.end_callback = null;
}

DKIMSignStream.prototype.destroy = function () {
    this.writable = false;
    // Stream destroyed before the callback ran
    if (this.end_callback) {
        this.end_callback(new Error('Stream destroyed'));
    }
}

exports.DKIMSignStream = DKIMSignStream;

exports.hook_queue_outbound = function (next, connection) {
    var plugin = this;
    if ( !isEnabled(plugin) ) return next();

    getKeyDirAsync(plugin,connection,function(keydir) {
        var domain, selector, private_key;
        var dkconf = plugin.config.get('dkim_sign.ini');
        if ( ! keydir ) {
            domain = dkconf.main.domain;
            private_key = plugin.config.get('dkim.private.key','data').join("\n");
            selector = dkconf.main.selector;
        }
        else {
            domain = keydir.split('/').pop();
            connection.logdebug(plugin, 'dkim_domain: '+domain);
            private_key = plugin.config.get('dkim/'+domain+'/private', 'data').join("\n");
            selector    = plugin.config.get('dkim/'+domain+'/selector','data').join("\n");
        }

        if ( ! hasKeyData(plugin,connection,domain,selector,private_key) ) {
            return next();
        };

        var headers_to_sign = getHeadersToSign(dkconf);
        var transaction = connection.transaction;
        var dkim_sign = new DKIMSignStream(selector,
                                        domain,
                                        private_key,
                                        headers_to_sign,
                                        transaction.header,
                                        function (err, dkim_header)
        {
            if (err) {
                connection.logerror(plugin, err.message);
            }
            else {
                connection.loginfo(plugin, dkim_header);
                transaction.add_header('DKIM-Signature', dkim_header);
            }
            return next();
        });
        transaction.message_stream.pipe(dkim_sign);
    });
};
/*
exports.hook_queue_outbound = function (next, connection) {
    var plugin = this;
    if ( !isEnabled(plugin) ) return next();

    var keydir = get_keydir(plugin, connection);
    connection.logdebug(this, 'dkim_keydir: '+keydir);

    var domain, selector, private_key;
    var dkconf = plugin.config.get('dkim_sign.ini');

    if ( keydir === false ) {
        domain = dkconf.main.domain;
        private_key = this.config.get('dkim.private.key','data').join("\n");
        selector = dkconf.main.selector;
    }
    else {
        domain = keydir.split('/').pop();
        connection.logdebug(this, 'dkim_domain: '+domain);
        private_key = this.config.get('dkim/'+domain+'/private', 'data').join("\n");
        selector    = this.config.get('dkim/'+domain+'/selector','data').join("\n");
    };

    if ( ! hasKeyData(plugin,connection,domain,selector,private_key) ) {
        return next();
    };

    var headers_to_sign = getHeadersToSign(dkconf);
    var transaction = connection.transaction;
    var dkim_sign = new DKIMSignStream(selector,
                                       domain,
                                       private_key,
                                       headers_to_sign,
                                       transaction.header,
                                       function (err, dkim_header)
    {
        if (err) {
            connection.logerror(plugin, err.message);
        }
        else {
            connection.loginfo(plugin, dkim_header);
            transaction.add_header('DKIM-Signature', dkim_header);
        }
        return next();
    });
    transaction.message_stream.pipe(dkim_sign);
}
*/
function get_keydir(plugin, conn) {
    var haraka_dir = process.env.HARAKA;

    // TODO: the DKIM signing key should be aligned with the domain
    // in the From header, so we *should* parse the domain from there.
    // However, the From header can contain multiple addresses and should be
    // parsed as described in RFC 2822 3.6.2. If From has multiple-addresses,
    // then we must parse and use the domain in the Sender header.
    // var domain = self.header.get('from').host;

    // In all cases I have seen, but likely not all cases, this suffices
    var domain = conn.transaction.mail_from.host;

    // split the domain name into labels
    var labels = domain.split('.');

    // find the most specific match (ex: mail.example.com, example.com, com)
    for ( var i=0; i<labels.length; i++ ) {
        var hld = labels.slice(i).join('.');
        plugin.logdebug(conn, "checking for key in: "+hld);
        var keydir = haraka_dir + "/config/dkim/"+hld;
        if ( fs.existsSync(keydir) ) {
            plugin.loginfo(conn, "found key dir: "+keydir);
            return keydir;
        };
        plugin.logdebug(conn, "missing key dir: "+keydir);
    }

    plugin.loginfo(conn, "no key dir for "+domain+" found");
    return false;
}

function getKeyDirAsync(plugin, conn, cb) {

    var haraka_dir = process.env.HARAKA;
    var domain = conn.transaction.mail_from.host;
    var labels = domain.split('.');

    // list possible matches (ex: mail.example.com, example.com, com)
    var dom_hier = [];
    for ( var i=0; i<labels.length; i++ ) {
        var dom = labels.slice(i).join('.');
        dom_hier[i] = haraka_dir + "/config/dkim/"+dom;
    };
    plugin.logdebug(conn, dom_hier);

    async.filter(dom_hier, fs.exists, function(results) {
        plugin.logdebug(conn, results);
        if ( !results ) {
            cb(false);
        };
        if ( typeof results === 'string' ) {
            cb(results);
        };
        cb(results[0]);
    });
};

function isEnabled(plugin) {
    var dkconf = plugin.config.get('dkim_sign.ini');
    if (dkconf.main.disabled && /(?:1|true|y[es])/i.test(dkconf.main.disabled)) {
        conn.logerror(plugin, 'skipped: disabled');
        return false;
    }
    return true;
};

function hasKeyData(plugin,conn,domain,selector,private_key) {

    // Make sure we have all the relevant configuration
    if (!private_key) {
        conn.logerror(plugin, 'skipped: missing dkim private key');
        return false;
    }
    if (!selector) {
        conn.logerror(plugin, 'skipped: missing selector');
        return false;
    }
    if (!domain) {
        conn.logerror(plugin, 'skipped: missing domain');
        return false;
    }

    conn.logprotocol(plugin, 'private_key: '+private_key);
    conn.logprotocol(plugin, 'selector: '+selector);
    return true;
};

function getHeadersToSign(dkconf) {
    var headers;
    if (dkconf.main.headers_to_sign) {
        headers = dkconf.main.headers_to_sign
                        .toLowerCase()
                        .replace(/\s+/g,'')
                        .split(/[,;:]/);
    }

    // From MUST be present
    if (headers.indexOf('from') === -1) {
        headers.push('from');
    }
    return headers;
}
