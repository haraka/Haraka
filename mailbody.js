// Mail Body Parser
var logger = require('./logger');
var Header = require('./mailheader').Header;
var events = require('events');
var util   = require('util');

var buf_siz = 65536;

function Body (header, options) {
    this.header = header || new Header();
    this.header_lines = [];
    this.options = options;
    this.bodytext = '';
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
    
    if (!enc.match(/^base64|quoted-printable|[78]bit$/i)) {
        logger.logerror("Invalid CTE on email: " + enc + ", using 8bit");
        enc = '8bit';
    }
    enc = enc.replace(/^quoted-printable$/i, 'qp');
    enc = enc.toLowerCase();
    
    this.decode_function = this["decode_" + enc];
    this.ct = ct;
    
    if (/^text\//i.test(ct)) {
        this.state = 'body';
    }
    else if (/^multipart\//i.test(ct)) {
        var match = ct.match(/boundary\s*=\s*["']?([^"';]+)["']?/i);
        this.boundary = match[1] || '';
        this.state = 'multipart_preamble';
    }
    else {
        var cd = this.header.get_decoded('content-disposition') || '';
        var match = cd.match(/name\s*=\s*["']?([^'";]+)["']?/i);
        if (!match) {
            match = ct.match(/name\s*=\s*["']?([^'";]+)["']?/i);
        }
        var filename = match ? match[1] : '';
        this.emit('attachment_start', ct, filename, this);
        this.buf_fill = 0;
        this.state = 'attachment';
        this.decode_function = this["decode_bin_" + enc];
    }
    
    this["parse_" + this.state](line);
}

Body.prototype.parse_end = function (line) {
    // ignore these lines - but we could store somewhere I guess.
}

Body.prototype.parse_body = function (line) {
    this.bodytext += this.decode_function(line);
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
    this.bodytext += this.decode_function(line);
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

Body.prototype.decode_bin_qp = function (line) {
    line = line.replace(/=$/, '');
    var buf = new Buffer(line.length);
    var offset = 0;
    var match;
    while (match = line.match(/^(.*?)=([A-F0-9][A-F0-9])/)) {
        line = line.substr(match[0].length);
        offset += buf.write(match[1], offset);
        buf[offset++] = parseInt(match[2], 16);
    }
    if (line.length) {
        buf.write(line, offset);
    }
    return buf;
}

Body.prototype.decode_qp = function (line) {
    line = line.replace(/=\r?\n/, '');
    line = line.replace(/=([A-F0-9][A-F0-9])/g, function (ignore, code) {
        return String.fromCharCode(parseInt(code, 16));
    });
    // TODO - figure out encoding and apply it
    var encoding = 'utf8';
    
    return new Buffer(line, encoding);
}

Body.prototype.decode_bin_base64 = function (line) {
    return new Buffer(line, "base64");
}

Body.prototype.decode_base64 = function (line) {
    // TODO - figure out encoding and apply it
    return new Buffer(line, "base64").toString();
}

Body.prototype.decode_8bit = function (line) {
    return line;
}

Body.prototype.decode_bin_8bit = function (line) {
    return new Buffer(line);
}

Body.prototype.decode_7bit = Body.prototype.decode_8bit;
Body.prototype.decode_bin_7bit = Body.prototype.decode_bin_8bit;
