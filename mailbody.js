"use strict";
// Mail Body Parser
var logger = require('./logger');
var Header = require('./mailheader').Header;
var utils  = require('./utils');
var config = require('./config');
var events = require('events');
var util   = require('util');
var Iconv  = require('./mailheader').Iconv;
var attstr = require('./attachment_stream');

var buf_siz = config.get('mailparser.bufsize') || 65536;

function Body (header, options) {
    this.header = header || new Header();
    this.header_lines = [];
    this.is_html = false;
    this.options = options || {};
    this.bodytext = '';
    this.body_text_encoded = '';
    this.body_encoding = null;
    this.boundary = null;
    this.ct = null;
    this.decode_function = null;
    this.children = []; // if multipart
    this.state = 'start';
    this.buf = new Buffer(buf_siz);
    this.buf_fill = 0;
}

util.inherits(Body, events.EventEmitter);
exports.Body = Body;

Body.prototype.parse_more = function (line) {
    return this["parse_" + this.state](line);
}

Body.prototype.parse_child = function (line) {
    // check for MIME boundary
    if (line.substr(0, (this.boundary.length + 2)) === ('--' + this.boundary)) {

        line = this.children[this.children.length -1].parse_end(line);

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
        return line;
    }
    // Pass data into last child
    return this.children[this.children.length - 1].parse_more(line);
}

Body.prototype.parse_headers = function (line) {
    if (/^\s*$/.test(line)) {
        // end of headers
        this.header.parse(this.header_lines);
        delete this.header_lines;
        this.state = 'start';
    }
    else {
        this.header_lines.push(line);
    }
    return line;
}

Body.prototype.parse_start = function (line) {
    var ct = this.header.get_decoded('content-type') || 'text/plain';
    var enc = this.header.get_decoded('content-transfer-encoding') || '8bit';
    var cd = this.header.get_decoded('content-disposition') || '';

    if (/text\/html/i.test(ct)) {
        this.is_html = true;
    }
   
    enc = enc.toLowerCase().split("\n").pop().trim(); 
    if (!enc.match(/^base64|quoted-printable|[78]bit$/i)) {
        logger.logerror("Invalid CTE on email: " + enc + ", using 8bit");
        enc = '8bit';
    }
    enc = enc.replace(/^quoted-printable$/i, 'qp');

    this.decode_function = this["decode_" + enc];
    if (!this.decode_function) {
        logger.logerror("No decode function found for: " + enc);
        this.decode_function = this.decode_8bit;
    }
    this.ct = ct;
    
    if (/^(?:text|message)\//i.test(ct) && !/^attachment/i.test(cd) ) {
        this.state = 'body';
    }
    else if (/^multipart\//i.test(ct)) {
        var match = ct.match(/boundary\s*=\s*["']?([^"';]+)["']?/i);
        this.boundary = match ? match[1] : '';
        this.state = 'multipart_preamble';
    }
    else {
        var match = cd.match(/name\s*=\s*["']?([^'";]+)["']?/i);
        if (!match) {
            match = ct.match(/name\s*=\s*["']?([^'";]+)["']?/i);
        }
        var filename = match ? match[1] : '';
        this.attachment_stream = attstr.createStream(this.header);
        this.emit('attachment_start', ct, filename, this, this.attachment_stream);
        this.buf_fill = 0;
        this.state = 'attachment';
    }
    
    return this["parse_" + this.state](line);
}

function _get_html_insert_position (buf) {
    // TODO: consider re-writing this to go backwards from the end
    for (var i=0,l=buf.length; i<l; i++) {
        if (buf[i] === 60 && buf[i+1] === 47) { // found: "</"
            if ( (buf[i+2] === 98  || buf[i+2] === 66) && // "b" or "B"
                 (buf[i+3] === 111 || buf[i+3] === 79) && // "o" or "O"
                 (buf[i+4] === 100 || buf[i+4] === 68) && // "d" or "D"
                 (buf[i+5] === 121 || buf[i+5] === 89) && // "y" or "Y"
                 buf[i+6] === 62)
            {
                // matched </body>
                return i;
            }
            if ( (buf[i+2] === 104 || buf[i+2] === 72) && // "h" or "H"
                 (buf[i+3] === 116 || buf[i+3] === 84) && // "t" or "T"
                 (buf[i+4] === 109 || buf[i+4] === 77) && // "m" or "M"
                 (buf[i+5] === 108 || buf[i+5] === 76) && // "l" or "L"
                 buf[i+6] === 62)
            {
                // matched </html>
                return i;
            }
        }
    }
    return buf.length - 1; // default is at the end
}

Body.prototype.parse_end = function (line) {
    if (!line) {
        line = '';
    }
    
    if (this.state === 'attachment') {
        if (this.buf_fill > 0) {
            // see below for why we create a new buffer here.
            var to_emit = new Buffer(this.buf_fill);
            this.buf.copy(to_emit, 0, 0, this.buf_fill);
            this.attachment_stream.emit_data(to_emit);
        }
        this.attachment_stream.emit_end();
    }

    // ignore these lines - but we could store somewhere I guess.
    if (this.body_text_encoded.length && this.bodytext.length === 0) {
        var buf = this.decode_function(this.body_text_encoded);

        var ct = this.header.get_decoded('content-type') || 'text/plain';
        var enc = 'UTF-8';
        var matches = /\bcharset\s*=\s*(?:\"|3D|')?([\w_\-]*)(?:\"|3D|')?/.exec(ct);
        if (matches) {
            enc = matches[1];
        }
        this.body_encoding = enc;

        if (this.options.banner && /^text\//i.test(ct)) {
            // up until this point we've returned '' for line, so now we insert
            // the banner and return the whole lot as one line, re-encoded using
            // whatever encoding scheme we had to use to decode it in the first
            // place.

            // First we convert the banner to the same encoding as the body
            var banner_str = this.options.banner[this.is_html ? 1 : 0];
            var banner_buf = null;
            if (Iconv) {
                try {
                    var converter = new Iconv("UTF-8", enc + "//IGNORE");
                    banner_buf = converter.convert(banner_str);
                }
                catch (err) {
                    logger.logerror("iconv conversion of banner to " + enc + " failed: " + err);
                }
            }

            if (!banner_buf) {
                banner_buf = new Buffer(banner_str);
            }

            // Allocate a new buffer: (7 or 2 is <P>...</P> vs \n...\n - correct that if you change those!)
            var new_buf = new Buffer(buf.length + banner_buf.length + (this.is_html ? 7 : 2));

            // Now we find where to insert it and combine it with the original buf:
            if (this.is_html) {
                var insert_pos = _get_html_insert_position(buf);

                // copy start of buf into new_buf
                buf.copy(new_buf, 0, 0, insert_pos);

                // add in <P>
                new_buf[insert_pos++] = 60;
                new_buf[insert_pos++] = 80;
                new_buf[insert_pos++] = 62;

                // copy all of banner into new_buf
                banner_buf.copy(new_buf, insert_pos);
                
                // add in </P>
                new_buf[banner_buf.length + insert_pos++] = 60;
                new_buf[banner_buf.length + insert_pos++] = 47;
                new_buf[banner_buf.length + insert_pos++] = 80;
                new_buf[banner_buf.length + insert_pos++] = 62;

                // copy remainder of buf into new_buf, if there is buf remaining
                if (buf.length > (insert_pos - 7)) {
                    buf.copy(new_buf, insert_pos + banner_buf.length, insert_pos - 7);
                }
            }
            else {
                buf.copy(new_buf);
                new_buf[buf.length] = 10; // \n
                banner_buf.copy(new_buf, buf.length + 1);
                new_buf[buf.length + banner_buf.length + 1] = 10; // \n
            }

            // Now convert back to base_64 or QP if required:
            if (this.decode_function === this.decode_qp) {
                line = utils.encode_qp(new_buf.toString("binary")) + "\n" + line;
            }
            else if (this.decode_function === this.decode_base64) {
                line = new_buf.toString("base64").replace(/(.{1,76})/g, "$1\n") + line;
            }
            else {
                line = new_buf.toString("binary") + line; // "binary" is deprecated, lets hope this works...
            }
        }

        // Now convert the buffer to UTF-8 to store in this.bodytext
        if (Iconv) {
            if (/UTF-?8/i.test(enc)) {
                this.bodytext = buf.toString();
            }
            else {
                try {
                    var converter = new Iconv(enc, "UTF-8");
                    this.bodytext = converter.convert(buf).toString();
                }
                catch (err) {
                    logger.logwarn("initial iconv conversion from " + enc + " to UTF-8 failed: " + err.message);
                    this.body_encoding = 'broken//' + enc;
                    // EINVAL is returned when the encoding type is not recognised/supported (e.g. ANSI_X3)
                    if (err.code !== 'EINVAL') {
                        // Perform the conversion again, but ignore any errors
                        try { 
                            var converter = new Iconv(enc, 'UTF-8//TRANSLIT//IGNORE');
                            this.bodytext = converter.convert(buf).toString();
                        }
                        catch (e) {
                            logger.logerror('iconv conversion from ' + enc + ' to UTF-8 failed: ' + e.message);
                            this.bodytext = buf.toString();
                        }
                    }
                }
            }
        }
        else {
            this.body_encoding = 'no_iconv';
            this.bodytext = buf.toString();
        }

        // delete this.body_text_encoded;
    }
    return line;
}

Body.prototype.parse_body = function (line) {
    this.body_text_encoded += line;
    if (this.options.banner)
        return '';
    return line;
}

Body.prototype.parse_multipart_preamble = function (line) {
    if (this.boundary) {
        if (line.substr(0, (this.boundary.length + 2)) === ('--' + this.boundary)) {
            if (line.substr(this.boundary.length + 2, 2) === '--') {
                // end
            }
            else {
                // next section
                var bod = new Body(new Header(), this.options);
                this.listeners('attachment_start').forEach(function (cb) { bod.on('attachment_start', cb) });
                this.children.push(bod);
                bod.state = 'headers';
                this.state = 'child';
            }
            return line;
        }
    }
    this.body_text_encoded += line;
    return line;
}

Body.prototype.parse_attachment = function (line) {
    if (this.boundary) {
        if (line.substr(0, (this.boundary.length + 2)) === ('--' + this.boundary)) {
            if (line.substr(this.boundary.length + 2, 2) === '--') {
                // end
            }
            else {
                // next section
                this.state = 'headers';
            }
            return line;
        }
    }

    var buf = this.decode_function(line);
    if ((buf.length + this.buf_fill) > buf_siz) {
        // now we have to create a new buffer, because if we write this out
        // using async code, it will get overwritten under us. Creating a new
        // buffer eliminates that problem (at the expense of a malloc and a
        // memcpy())
        var to_emit = new Buffer(this.buf_fill);
        this.buf.copy(to_emit, 0, 0, this.buf_fill);
        this.attachment_stream.emit_data(to_emit);
        if (buf.length > buf_siz) {
            // this is an unusual case - the base64/whatever data is larger
            // than our buffer size, so we just emit it and reset the counter.
            this.attachment_stream.emit_data(buf);
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
    return line;
}

Body.prototype.decode_qp = utils.decode_qp;

Body.prototype.decode_base64 = function (line) {
    return new Buffer(line, "base64");
}

Body.prototype.decode_8bit = function (line) {
    return new Buffer(line, 'binary');
}

Body.prototype.decode_7bit = Body.prototype.decode_8bit;
