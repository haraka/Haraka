// dkim_signer
// Implements DKIM core as per www.dkimcore.org

var crypto = require('crypto');
var Stream = require('stream').Stream;
var indexOfLF = require('./utils').indexOfLF;
var util = require('util');

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
    var self = this;
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

    var dkim_sign = new DKIMSignStream(config.main.selector, 
                                       config.main.domain, 
                                       private_key, 
                                       headers_to_sign, 
                                       transaction.header, 
                                       function (err, dkim_header) 
    {
        if (err) {
            connection.logerror(self, err.message);
        }
        else {
            connection.loginfo(self, dkim_header);
            transaction.add_header('DKIM-Signature', dkim_header);
        }
        return next();
    }); 
    transaction.message_stream.pipe(dkim_sign);
}
