"use strict";
// Mail Body Parser
var logger = require('./logger');
var Header = require('./mailheader').Header;
var events = require('events');
var util   = require('util');
var Iconv  = require('./mailheader').Iconv;

var buf_siz = 65536;

function Body (header, options) {
    this.header = header || new Header();
    this.header_lines = [];
    this.options = options;
    this.bodytext = '';
    this.is_html = false;
    this.body_text_encoded = '';
    this.children = []; // if multipart
    this.state = 'start';
    this.buf = new Buffer(buf_siz);
    this.buf_fill = 0;
}

util.inherits(Body, events.EventEmitter);
exports.Body = Body;

Body.prototype.parse_more = function (line) {
    this["parse_" + this.state](line);
}

Body.prototype.parse_child = function (line) {
    // check for MIME boundary
    if (line.substr(0, (this.boundary.length + 2)) === ('--' + this.boundary)) {

        this.children[this.children.length -1].parse_end(line);

        if (this.children[this.children.length -1].state === 'attachment') {
            var child = this.children[this.children.length - 1];
            if (child.buf_fill > 0) {
                // see below for why we create a new buffer here.
                var to_emit = new Buffer(child.buf_fill);
                child.buf.copy(to_emit, 0, 0, child.buf_fill);
                this.emit('attachment_data', to_emit);
            }
            this.emit('attachment_end');
        }

        if (line.substr(this.boundary.length + 2, 2) === '--') {
            // end
            this.state = 'end';
        }
        else {
            var bod = new Body(new Header(), this.options);
            this.listeners('attachment_start').forEach(function (cb) { bod.on('attachment_start', cb) });
            this.listeners('attachment_data' ).forEach(function (cb) { bod.on('attachment_data', cb) });
            this.listeners('attachment_end'  ).forEach(function (cb) { bod.on('attachment_end', cb) });
            this.children.push(bod);
            bod.state = 'headers';
        }
        return;
    }
    // Pass data into last child
    this.children[this.children.length - 1].parse_more(line);
}

Body.prototype.parse_headers = function (line) {
    if (/^\s*$/.test(line)) {
        // end of headers
        this.header.parse(this.header_lines);
        if (this.options.banner && this.header.get_decoded('content-type').match(/^text\/(?:plain|html)/i)) {
            var enc = this.header.body_encoding();
            try {
                var converter = new Iconv("UTF-8", enc);
                this.enc_banner = [
                    converter.convert(this.options.banner[0]).toString(),
                    converter.convert(this.options.banner[1]).toString()
                ];
                if (this.header.get_decoded('content-type').match(/^text\/html/i)) {
                    this.is_html = true;
                }
            }
            catch (err) {
                logger.logerror("iconv conversion of banner from UTF-8 to " + enc + " failed: " + err);
                this.enc_banner = null;
            }
        }
        delete this.header_lines;
        this.state = 'start';
    }
    else {
        this.header_lines.push(line);
    }
}

Body.prototype.parse_start = function (line) {
    var ct = this.header.get_decoded('content-type') || 'text/plain';
    var enc = this.header.get_decoded('content-transfer-encoding') || '8bit';
    var cd = this.header.get_decoded('content-disposition') || '';
    
    if (!enc.match(/^base64|quoted-printable|[78]bit$/i)) {
        logger.logerror("Invalid CTE on email: " + enc + ", using 8bit");
        enc = '8bit';
    }
    enc = enc.replace(/^quoted-printable$/i, 'qp');
    enc = enc.toLowerCase().split("\n").pop().trim();
    
    this.decode_function = this["decode_" + enc];
    this.ct = ct;
    
    if (/^(?:text|message)\//i.test(ct) && !/^attachment/i.test(cd) ) {
        this.state = 'body';
    }
    else if (/^multipart\//i.test(ct)) {
        var match = ct.match(/boundary\s*=\s*["']?([^"';]+)["']?/i);
        this.boundary = match[1] || '';
        this.state = 'multipart_preamble';
    }
    else {
        var match = cd.match(/name\s*=\s*["']?([^'";]+)["']?/i);
        if (!match) {
            match = ct.match(/name\s*=\s*["']?([^'";]+)["']?/i);
        }
        var filename = match ? match[1] : '';
        this.emit('attachment_start', ct, filename, this);
        this.buf_fill = 0;
        this.state = 'attachment';
    }
    
    this["parse_" + this.state](line);
}

Body.prototype.parse_end = function (line) {
    // ignore these lines - but we could store somewhere I guess.
    if (this.body_text_encoded.length) {
        var buf = this.decode_function(this.body_text_encoded);
        if (Iconv) {
            var enc = this.header.body_encoding();
            this.body_encoding = enc;
            if (/UTF-?8/i.test(enc)) {
                this.bodytext = buf.toString();
            }
            else {
                try {
                    var converter = new Iconv(enc, "UTF-8");
                    this.bodytext = converter.convert(buf).toString();
                }
                catch (err) {
                    logger.logerror("iconv conversion from " + enc + " to UTF-8 failed: " + err);
                    this.body_encoding = 'broken//' + enc;
                    this.bodytext = buf.toString();
                }
            }
        }
        else {
            this.body_encoding = 'no_iconv';
            this.bodytext = buf.toString();
        }
        // delete this.body_text_encoded;
    }
}

Body.prototype.parse_body = function (line) {
    if (this.enc_banner && this.is_html) {
        var match = line.match(/^(.*)<\/body>(.*)$/i);
        if (match) {
            line = match[1] + this.enc_banner[1] + match[2];
        }
    }
    this.body_text_encoded += line;
}

Body.prototype.parse_multipart_preamble = function (line) {
    if (this.boundary) {
        if (line.substr(0, (this.boundary.length + 2)) === ('--' + this.boundary)) {
            if (line.substr(this.boundary.length + 2, 2) === '--') {
                // end
                return;
            }
            else {
                // next section
                var bod = new Body(new Header(), this.options);
                this.listeners('attachment_start').forEach(function (cb) { bod.on('attachment_start', cb) });
                this.listeners('attachment_data' ).forEach(function (cb) { bod.on('attachment_data', cb) });
                this.listeners('attachment_end'  ).forEach(function (cb) { bod.on('attachment_end', cb) });
                this.children.push(bod);
                bod.state = 'headers';
                this.state = 'child';
                return;
            }
        }
    }
    this.body_text_encoded += line;
}

Body.prototype.parse_attachment = function (line) {
    if (this.boundary) {
        if (line.substr(0, (this.boundary.length + 2)) === ('--' + this.boundary)) {
            if (line.substr(this.boundary.length + 2, 2) === '--') {
                // end
                return;
            }
            else {
                // next section
                this.state = 'headers';
                return;
            }
        }
    }

    var buf = this.decode_function(line);
    //this.emit('attachment_data', buf);
    //return;

    if ((buf.length + this.buf_fill) > buf_siz) {
        // now we have to create a new buffer, because if we write this out
        // using async code, it will get overwritten under us. Creating a new
        // buffer eliminates that problem (at the expense of a malloc and a
        // memcpy())
        var to_emit = new Buffer(this.buf_fill);
        this.buf.copy(to_emit, 0, 0, this.buf_fill);
        this.emit('attachment_data', to_emit);
        if (buf.length > buf_siz) {
            // this is an unusual case - the base64/whatever data is larger
            // than our buffer size, so we just emit it and reset the counter.
            this.emit('attachment_data', buf);
            this.buf_fill = 0;
        }
        else {
            buf.copy(this.buf);
            this.buf_fill = buf.length;
        }
    }
    else {
        buf.copy(this.buf, this.buf_fill);
        this.buf_fill += buf.length;
    }
}

Body.prototype.decode_qp = require('./mailheader').decode_qp;

Body.prototype.decode_base64 = function (line) {
    return new Buffer(line, "base64");
}

Body.prototype.decode_8bit = function (line) {
    return new Buffer(line);
}

Body.prototype.decode_7bit = Body.prototype.decode_8bit;
