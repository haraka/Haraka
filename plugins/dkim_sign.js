// dkim_signer
// Implements DKIM core as per www.dkimcore.org

var addrparser = require('address-rfc2822'),
    async      = require('async'),
    crypto     = require('crypto'),
    fs         = require('fs'),
    Stream     = require('stream').Stream,
    util       = require('util'),
    utils      = require('./utils');

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
    while ((offset = utils.indexOfLF(buf)) !== -1) {
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
};

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
    for (var i=0; i < this.headers_to_sign.length; i++) {
        var head = this.header.get(this.headers_to_sign[i]);
        if (head) {
            head = head.replace(/\r?\n/gm, '');
            head = head.replace(/\s+/gm, ' ');
            head = head.replace(/\s+$/gm, '');
            this.signer.update(this.headers_to_sign[i] + ':' + head + "\r\n");
            headers.push(this.headers_to_sign[i]);
        }
    }

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
};

DKIMSignStream.prototype.destroy = function () {
    this.writable = false;
    // Stream destroyed before the callback ran
    if (this.end_callback) {
        this.end_callback(new Error('Stream destroyed'));
    }
};

exports.DKIMSignStream = DKIMSignStream;

exports.register = function () {
    var plugin = this;
    plugin.load_dkim_sign_ini();
    plugin.load_dkim_key();
};

exports.load_dkim_sign_ini = function () {
    var plugin = this;
    plugin.cfg = plugin.config.get('dkim_sign.ini', {
            booleans: [
                '-disabled',
            ]
        },
        function () { plugin.load_dkim_sign_ini(); }
    );
};

exports.load_dkim_key = function () {
    var plugin = this;
    plugin.private_key = plugin.config.get(
        'dkim.private.key',
        'data',
        function () { plugin.load_dkim_key(); }
    ).join('\n');
};

exports.load_key = function (file) {
    return this.config.get(file, 'data').join('\n');
};

exports.hook_queue_outbound = function (next, connection) {
    var plugin = this;
    if (plugin.cfg.main.disabled) { return next(); }

    plugin.get_key_dir(connection, function(keydir) {
        var domain, selector, private_key;
        if (!keydir) {
            domain = plugin.cfg.main.domain;
            private_key = plugin.private_key;
            selector = plugin.cfg.main.selector;
        }
        else {
            domain = keydir.split('/').pop();
            connection.logdebug(plugin, 'dkim_domain: '+domain);
            private_key = plugin.load_key('dkim/'+domain+'/private');
            selector    = plugin.load_key('dkim/'+domain+'/selector');
        }

        if (!plugin.has_key_data(connection,domain,selector,private_key)) {
            return next();
        }

        var headers_to_sign = plugin.get_headers_to_sign();
        var txn = connection.transaction;
        var dkim_sign = new DKIMSignStream(selector,
                                        domain,
                                        private_key,
                                        headers_to_sign,
                                        txn.header,
                                        function (err, dkim_header)
        {
            if (err) {
                txn.results.add(plugin, {err: err.message});
            }
            else {
                connection.loginfo(plugin, 'signed for ' + domain);
                txn.results.add(plugin, {pass: dkim_header});
                txn.add_header('DKIM-Signature', dkim_header);
            }
            return next();
        });
        txn.message_stream.pipe(dkim_sign);
    });
};

exports.get_key_dir = function (connection, cb) {
    var plugin = this;
    var txn    = connection.transaction;
    var domain = plugin.get_sender_domain(txn);
    if (!domain) { return cb(); }

    // split the domain name into labels
    var labels     = domain.split('.');
    var haraka_dir = process.env.HARAKA;

    // list possible matches (ex: mail.example.com, example.com, com)
    var dom_hier = [];
    for (var i=0; i<labels.length; i++) {
        var dom = labels.slice(i).join('.');
        dom_hier[i] = haraka_dir + "/config/dkim/"+dom;
    }
    connection.logdebug(plugin, dom_hier);

    async.filter(dom_hier, fs.exists, function(results) {
        connection.logdebug(plugin, results);
        cb(results[0]);
    });
};

exports.has_key_data = function (conn, domain, selector, private_key) {
    var plugin = this;

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

exports.get_headers_to_sign = function () {
    var plugin = this;
    var headers = [];
    if (!plugin.cfg.main.headers_to_sign) {
        return headers;
    }

    headers = plugin.cfg.main.headers_to_sign
                    .toLowerCase()
                    .replace(/\s+/g,'')
                    .split(/[,;:]/);

    // From MUST be present
    if (headers.indexOf('from') === -1) {
        headers.push('from');
    }
    return headers;
};

exports.get_sender_domain = function (txn) {
    var plugin = this;
    if (!txn) { return; }

    // a fallback, when header parsing fails
    var domain;
    try { domain = txn.mail_from.host; }
    catch (e) {
        plugin.logerror(e);
    }

    if (!txn.header) { return domain; }

    // the DKIM signing key should be aligned with the domain in the From
    // header (see DMARC). Try to parse the domain from there.
    var from_hdr = txn.header.get('From');
    if (!from_hdr) { return domain; }

    // The From header can contain multiple addresses and should be
    // parsed as described in RFC 2822 3.6.2.
    var addrs = addrparser.parse(from_hdr);
    if (!addrs || ! addrs.length) { return domain; }

    // If From has a single address, we're done
    if (addrs.length === 1) { return addrs[0].host(); }

    // If From has multiple-addresses, we must parse and
    // use the domain in the Sender header.
    try {
        domain = (addrparser.parse(txn.header.get('Sender')))[0].host();
    }
    catch (e) {
        plugin.logerror(e);
    }
    return domain;
};
