// dkim_signer
// Implements DKIM core as per www.dkimcore.org

const addrparser = require('address-rfc2822');
const async      = require('async');
const crypto     = require('crypto');
const fs         = require('fs');
const path       = require('path');
const Stream     = require('stream').Stream;

const utils      = require('haraka-utils');

class DKIMSignStream extends Stream {
    constructor (selector, domain, private_key, headers_to_sign, header, end_callback) {
        super();
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
        this.body_found = false;
    }

    write (buf) {
        /*
        ** BODY (simple canonicalization)
        */

        // Merge in any partial data from last iteration
        if (this.buffer.ar.length) {
            this.buffer.ar.push(buf);
            this.buffer.len += buf.length;
            const nb = Buffer.concat(this.buffer.ar, this.buffer.len);
            buf = nb;
            this.buffer = { ar: [], len: 0 };
        }
        // Process input buffer into lines
        let offset = 0;
        while ((offset = utils.indexOfLF(buf)) !== -1) {
            const line = buf.slice(0, offset+1);
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
                    const lb = Buffer.concat(this.line_buffer.ar, this.line_buffer.len);
                    this.line_buffer = { ar: [], len: 0 };
                    this.hash.update(lb);
                }
                this.hash.update(line);
                this.body_found = true;
            }
        }
        if (buf.length) {
            // We have partial data...
            this.buffer.ar.push(buf);
            this.buffer.len += buf.length;
        }
    }

    end (buf) {
        this.writable = false;

        // Add trailing CRLF if we have data left over
        if (this.buffer.ar.length) {
            this.buffer.ar.push(Buffer.from("\r\n"));
            this.buffer.len += 2;
            const le = Buffer.concat(this.buffer.ar, this.buffer.len);
            this.hash.update(le);
            this.buffer = { ar: [], len: 0 };
        }

        if (!this.body_found) {
            this.hash.update(Buffer.from("\r\n"));
        }

        const bodyhash = this.hash.digest('base64');

        /*
        ** HEADERS (relaxed canonicaliztion)
        */

        const headers = [];
        for (let i=0; i < this.headers_to_sign.length; i++) {
            let head = this.header.get(this.headers_to_sign[i]);
            if (head) {
                head = head.replace(/\r?\n/gm, '');
                head = head.replace(/\s+/gm, ' ');
                head = head.replace(/\s+$/gm, '');
                this.signer.update(this.headers_to_sign[i] + ':' + head + "\r\n");
                headers.push(this.headers_to_sign[i]);
            }
        }

        // Create DKIM header
        let dkim_header = 'v=1;a=rsa-sha256;bh=' + bodyhash +
                        ';c=relaxed/simple;d=' + this.domain +
                        ';h=' + headers.join(':') +
                        ';s=' + this.selector +
                        ';b=';
        this.signer.update('dkim-signature:' + dkim_header);
        const signature = this.signer.sign(this.private_key, 'base64');
        dkim_header += signature;

        if (this.end_callback) this.end_callback(null, dkim_header);
        this.end_callback = null;
    }

    destroy () {
        this.writable = false;
        // Stream destroyed before the callback ran
        if (this.end_callback) {
            this.end_callback(new Error('Stream destroyed'));
        }
    }
}

exports.DKIMSignStream = DKIMSignStream;

exports.register = function () {
    const plugin = this;
    plugin.load_dkim_sign_ini();
    plugin.load_dkim_key();
}

exports.load_dkim_sign_ini = function () {
    const plugin = this;
    plugin.cfg = plugin.config.get('dkim_sign.ini', {
        booleans: [
            '-disabled',
        ]
    },
    function () { plugin.load_dkim_sign_ini(); }
    );
}

exports.load_dkim_key = function () {
    const plugin = this;
    plugin.private_key = plugin.config.get(
        'dkim.private.key',
        'data',
        function () { plugin.load_dkim_key(); }
    ).join('\n');
}

exports.load_key = function (file) {
    return this.config.get(file, 'data').join('\n');
}

exports.hook_queue_outbound = exports.hook_pre_send_trans_email = function (next, connection) {
    const plugin = this;
    if (plugin.cfg.main.disabled) return next();

    if (connection.transaction.notes.dkim_signed) {
        connection.logdebug(plugin, 'already signed');
        return next();
    }

    let selector;
    let private_key;
    let domain = plugin.get_sender_domain(connection);

    if (!domain) {
        connection.transaction.results.add(plugin, {skip: "sending domain not detected", emit: true });

        if (!plugin.cfg.main.domain || !plugin.private_key || !plugin.cfg.main.selector) {
            return next();
        }

        connection.transaction.results.add(plugin, {msg: "using default key", emit: true });

        domain = plugin.cfg.main.domain;
        private_key = plugin.private_key;
        selector = plugin.cfg.main.selector;
    }

    plugin.get_key_dir(connection, domain, function (err, keydir) {
        if (err) {
            connection.logerror(plugin, err);
            return next(DENYSOFT, "Error getting key_dir in dkim_sign");
        }

        if (keydir) {
            domain = path.basename(keydir);
            private_key = plugin.load_key(path.join('dkim', domain, 'private'));
            selector    = plugin.load_key(path.join('dkim', domain, 'selector')).trim();
        }

        if (!plugin.has_key_data(connection, domain, selector, private_key)) return next();
        connection.logdebug(plugin, `domain: ${domain}`);

        const headers_to_sign = plugin.get_headers_to_sign();
        const txn = connection.transaction;

        function dkimCallback (err2, dkim_header) {
            if (err2) {
                txn.results.add(plugin, {err: err2.message});
            }
            else {
                connection.loginfo(plugin, `signed for ${domain}`);
                txn.results.add(plugin, {pass: dkim_header});
                txn.add_header('DKIM-Signature', dkim_header);
            }
            connection.transaction.notes.dkim_signed = true;
            next();
        }

        txn.message_stream.pipe(
            new DKIMSignStream(selector, domain, private_key, headers_to_sign, txn.header, dkimCallback)
        );
    });
}

exports.get_key_dir = function (connection, domain, done) {
    const plugin = this;

    if (!domain) return done(new Error('missing domain'));

    // split the domain name into labels
    const labels     = domain.split('.');
    const haraka_dir = process.env.HARAKA || '';

    // list possible matches (ex: mail.example.com, example.com, com)
    const dom_hier = [];
    for (let i=0; i<labels.length; i++) {
        const dom = labels.slice(i).join('.');
        dom_hier[i] = path.resolve(haraka_dir, 'config', 'dkim', dom);
    }

    async.detectSeries(dom_hier, function (filePath, iterDone) {
        fs.stat(filePath, function (err, stats) {
            if (err) return iterDone(null, false);
            iterDone(null, stats.isDirectory());
        });
    },
    function (err, results) {
        connection.logdebug(plugin, results);
        done(err, results);
    });
}

exports.has_key_data = function (conn, domain, selector, private_key) {
    const plugin = this;

    let missing = undefined;

    // Make sure we have all the relevant configuration
    if (!private_key) {
        missing = 'private key';
    }
    else if (!selector) {
        missing = 'selector';
    }
    else if (!domain) {
        missing = 'domain';
    }

    if (missing) {
        if (domain) {
            conn.lognotice(plugin, `skipped: no ${missing} for ${domain}`);
        }
        else {
            conn.lognotice(plugin, `skipped: no ${missing}`);
        }
        return false;
    }

    conn.logprotocol(plugin, `using selector: ${selector} at domain ${domain}`);
    return true;
}

exports.get_headers_to_sign = function () {
    const plugin = this;
    let headers = [];
    if (!plugin.cfg.main.headers_to_sign) return headers;

    headers = plugin.cfg.main.headers_to_sign
        .toLowerCase()
        .replace(/\s+/g,'')
        .split(/[,;:]/);

    // From MUST be present
    if (headers.indexOf('from') === -1) {
        headers.push('from');
    }
    return headers;
}

exports.get_sender_domain = function (connection) {
    const plugin = this;
    if (!connection.transaction) {
        connection.logerror(plugin, 'no transaction!')
        return;
    }

    const txn = connection.transaction;

    // fallback to Envelope FROM when header parsing fails
    let domain;
    if (txn.mail_from.host) {
        try { domain = txn.mail_from.host.toLowerCase(); }
        catch (e) {
            connection.logerror(plugin, e);
        }
    }

    if (!txn.header) return domain;

    // the DKIM signing key should be aligned with the domain in the From
    // header (see DMARC). Try to parse the domain from there.
    const from_hdr = txn.header.get_decoded('From');
    if (!from_hdr) return domain;

    // The From header can contain multiple addresses and should be
    // parsed as described in RFC 2822 3.6.2.
    let addrs;
    try {
        addrs = addrparser.parse(from_hdr);
    }
    catch (e) {
        connection.logerror(plugin, `address-rfc2822 failed to parse From header: ${from_hdr}`)
        return domain;
    }
    if (!addrs || ! addrs.length) return domain;

    // If From has a single address, we're done
    if (addrs.length === 1 && addrs[0].host) {
        let fromHost = addrs[0].host();
        if (fromHost) {
            // don't attempt to lower a null or undefined value #1575
            fromHost = fromHost.toLowerCase();
        }
        return fromHost;
    }

    // If From has multiple-addresses, we must parse and
    // use the domain in the Sender header.
    const sender = txn.header.get_decoded('Sender');
    if (sender) {
        try {
            domain = (addrparser.parse(sender))[0].host().toLowerCase();
        }
        catch (e) {
            connection.logerror(plugin, e);
        }
    }
    return domain;
}
