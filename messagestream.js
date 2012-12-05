// MessageStream class

var fs = require('fs');
var util = require('util');
var Stream = require('stream').Stream;
var ChunkEmitter = require('./chunkemitter');
var indexOfLF = require('./utils').indexOfLF;

const STATE_HEADERS      = 1;
const STATE_BODY         = 2;
const STATE_MIME_HEADERS = 3;
const STATE_MIME_BODY    = 4

const TEXT_BANNER       = 0;
const HTML_BANNER       = 1;
const PRE_TEXT_BANNER   = 2;
const PRE_HTML_BANNER   = 3;
const ORIGINAL_CT       = 4;
const ORIGINAL_CTE      = 5;

const TYPE_PLAIN = 1;
const TYPE_HTML  = 2;
const TYPE_BOTH  = 3;

function MessageStream (config, id, headers) {
    if (!id) throw new Error('id required');
    Stream.call(this);
    this.uuid = id;
    this.write_ce = null;
    this.read_ce = null;
    this.bytes_read = 0;
    this.state = STATE_HEADERS;
    this.idx = { ctypes: [] };
    this.end_called = false;
    this.end_callback = null;
    this.buffered = 0;
    this._queue = [];
    this.max_data_inflight = 0;
    this.buffer_max = (!isNaN(config.main.spool_after) ? 
                       Number(config.main.spool_after) : -1);
    this.spooling = false;
    this.fd = null;    
    this.open_pending = false;
    this.spool_dir = config.main.spool_dir || '/tmp';
    this.filename = this.spool_dir + '/' + id + '.eml';
    this.write_pending = false;

    this.readable = true;
    this.paused = false;
    this.headers = headers || [];
    this.headers_done = false;
    this.headers_found_eoh = false;
    this.line_endings = "\r\n";
    this.dot_stuffing = false;
    this.ending_dot = false;
    this.buffer_size = (1024 * 64);
    this.start = 0;
    this.write_complete = false;
    this.ws = null;
    this.rs = null;
    this.in_pipe = false;
    this.banner = null;
    this.banner_type = TYPE_PLAIN;
    this.no_banner = false;
}

util.inherits(MessageStream, Stream);

MessageStream.prototype.set_banner = function (text, html) {
    if (!html) {
        html = text.replace(/\n/g, '<br/>\n');
    }

    this.banner = this.banner || [];

    this.banner[TEXT_BANNER] = text;
    this.banner[HTML_BANNER] = html;
}

MessageStream.prototype.set_top_banner = function (text, html) {
    if (!html) {
        html = text.replace(/\n/g, '<br/>\n');
    }

    this.banner = this.banner || [];

    this.banner[PRE_TEXT_BANNER] = text;
    this.banner[PRE_HTML_BANNER] = html;
}

MessageStream.prototype.add_line = function (line) {
    var self = this;

    if (typeof line === 'string') {
        line = new Buffer(line);
    }

    // create a ChunkEmitter
    if (!this.write_ce) {
        this.write_ce = new ChunkEmitter();
        this.write_ce.on('data', function (chunk) {
            self._write(chunk);
        });
    }

    this.bytes_read += line.length;

    // Build up an index of 'interesting' data on the fly
    if (this.state === STATE_HEADERS || this.state === STATE_MIME_HEADERS) {
        // Look for end of headers line
        if (line.length === 2 && line[0] === 0x0d && line[1] === 0x0a) {
            if (this.state === STATE_HEADERS) {
                this.idx['headers'] = { start: 0, end: this.bytes_read-line.length };
                this.state = STATE_BODY;
                this.idx['body'] = { start: this.bytes_read };
            } else if (this.state === STATE_MIME_HEADERS) {
                this.state = STATE_MIME_BODY;
            }
        }
        var ct;
        if ((ct = /^Content-Type:\s*([^; ]+)/i.exec(line.toString()))) {
            this.idx.ctypes.push(ct[1].toLowerCase());
        }
    }

    if (this.state === STATE_BODY || this.state === STATE_MIME_BODY) {
        // Look for MIME boundaries
        if (line.length > 4 && line[0] === 0x2d && line[1] == 0x2d) {
            var boundary = line.slice(2).toString().replace(/\s*$/,'');
            if (/--\s*$/.test(line)) {
                // End of boundary?
                boundary = boundary.slice(0, -2);
                if (this.idx[boundary]) {
                    this.idx[boundary]['end'] = this.bytes_read;
                    this.state = STATE_BODY;
                }
            }
            else {
                // Start of boundary?
                if (!this.idx[boundary]) {
                    this.idx[boundary] = { start: this.bytes_read-line.length };
                    this.state = STATE_MIME_HEADERS;
                }
                else {
                    // Next part
                    this.state = STATE_MIME_HEADERS;
                }
            }
        }
    }

    this.write_ce.fill(line);
}

MessageStream.prototype.add_line_end = function (cb) {
    // Record body end position
    if (this.idx['body']) {
        this.idx['body']['end'] = this.bytes_read;
    }

    // Work out what type of banner we can use
    var idx;
    if ((idx = this.idx.ctypes.indexOf('multipart/alternative')) !== -1 &&
        /text\/(?:plain|html)/.test(this.idx.ctypes[++idx]) &&
        /text\/(?:plain|html)/.test(this.idx.ctypes[++idx]))
    {
        this.banner_type = TYPE_BOTH;
    }
    else if (this.idx.ctypes.indexOf('text/html')  !== -1 &&
             this.idx.ctypes.indexOf('text/plain') === -1)
    {
        this.banner_type = TYPE_HTML;
    }
    else {
        this.banner_type = TYPE_PLAIN;
    }

    this.end_called = true;
    if (cb && typeof cb === 'function') {
        this.end_callback = cb;
    }
    // Call _write() only if no new data was emitted
    // This might happen if the message size matches
    // the size of the chunk buffer.
    if (!this.write_ce.end()) {
        this._write();
    }
}

MessageStream.prototype._write = function (data) {
    var self = this;
    if (data) {
        this.buffered += data.length;
        this._queue.push(data);
    }
    // Stats 
    if (this.buffered > this.max_data_inflight) {
        this.max_data_inflight = this.buffered;
    }
    // Abort if we have pending disk operations
    if (this.open_pending || this.write_pending) return false;
    // Do we need to spool to disk?
    if (this.buffer_max !== -1 && this.buffered > this.buffer_max) {
        this.spooling = true;
    }
    // Have we completely finished writing all data?
    if (this.end_called && (!this.spooling || (this.spooling && !this._queue.length))) {
        if (this.end_callback) this.end_callback();
        // Do we have any waiting readers?
        if (this.listeners('data').length && !this.write_complete) {
            this.write_complete = true;
            process.nextTick(function () {
                if (self.readable && !self.paused)
                    self._read();
            });
        }
        else {
            this.write_complete = true;
        }
        return true;
    }
    if (this.buffer_max === -1 || (this.buffered < this.buffer_max && !this.spooling)) {
        return true;
    }
    else {
        // We're spooling to disk
        if (!this._queue.length) {
            return false;
        }
    }

    // Open file descriptor if needed 
    if (!this.fd && !this.open_pending) {
        this.open_pending = true;
        this.ws = fs.createWriteStream(this.filename, { flags: 'wx+', end: false })
        this.ws.on('open', function (fd) {
            self.fd = fd;
            self.open_pending = false;
            process.nextTick(function () {
                self._write();
            });
        });
        this.ws.on('error', function (error) {
            self.emit('error', error);
        }); 
    }

    if (!this.fd) return false;
    var to_send = this._queue.shift();
    this.buffered -= to_send.length;
    // TODO: try and implement backpressure
    if (!this.ws.write(to_send)) {
        this.write_pending = true;
        this.ws.once('drain', function () {
            self.write_pending = false;
            process.nextTick(function () {
                self._write();
            });
        });
        return false;
    }
    else {
        return true;
    }
}

/*
** READABLE STREAM
*/

MessageStream.prototype._emit_banner_ct = function (original_ct) {
    var banner_boundary = "banner_" + this.uuid;
    this.banner[ORIGINAL_CT] = original_ct;
    this.read_ce.fill("Content-Type: multipart/mixed; boundary=" + banner_boundary + this.line_endings);
    this.read_ce.fill("MIME-Version: 1.0" + this.line_endings);
}

MessageStream.prototype._read = function () {
    var self = this;
    if (!this.end_called) {
        throw new Error('end not called!');
    }

    if (!this.readable || this.paused || !this.write_complete) {
        return;
    }

    // Buffer and send headers first.
    //
    // Headers are always stored in an array of strings
    // as they are heavily read and modified throughout
    // the reception of a message.
    //
    // Typically headers will be < 32Kb (Sendmail limit)
    // so we do all of them in one operation before we
    // loop around again (and check for pause).
    if (this.headers.length && !this.headers_done) {
        this.headers_done = true;
        var ct_emitted = false;
        for (var i=0; i<this.headers.length; i++) {
            if (!this.no_banner && this.banner && /^Content-Type:/i.test(this.headers[i])) {
                this._emit_banner_ct(this.headers[i]);
                ct_emitted = true;
            }
            else if (!this.no_banner && this.banner && /^MIME-Version:/i.test(this.headers[i])) {
                // Ignore MIME-Version header as it's emitted by the banner code
            }
            else if (this.banner && /^Content-Transfer-Encoding:/i.test(this.headers[i])) {
                // We need to store this
                this.banner[ORIGINAL_CTE] = this.headers[i];
            }
            else {
                this.read_ce.fill(this.headers[i].replace(/\r?\n/g,this.line_endings));
            }
        }

        // if banner not yet emitted
        if (!this.no_banner && this.banner && !ct_emitted) {
            this._emit_banner_ct("Content-Type: text/plain\r\n");
        }

        // Add end of headers marker
        this.read_ce.fill(this.line_endings);
        // Loop
        process.nextTick(function () {
            if (self.readable && !self.paused) 
                self._read();
        });
    }
    else {
        if (!this.no_banner && this.banner) {
            this.read_ce.fill("This is a multi-part message in MIME format." + this.line_endings);
            this.read_ce.fill(this.line_endings);

            if (this.banner[PRE_TEXT_BANNER]) {
                this.read_ce.fill("--banner_" + this.uuid + this.line_endings);
                if (this.banner_type === TYPE_BOTH) {
                    var banner_end_boundary = "banner_end_" + this.uuid;
                    this.read_ce.fill("Content-Type: multipart/alternative; boundary=" + banner_end_boundary + this.line_endings);
                    this.read_ce.fill(this.line_endings);
                    this.read_ce.fill("--" + banner_end_boundary + this.line_endings);
                }
                if (this.banner_type === TYPE_PLAIN || this.banner_type === TYPE_BOTH) {
                    this.read_ce.fill("Content-Type: text/plain; charset=utf8" + this.line_endings);
                    this.read_ce.fill(this.line_endings);
                    this.read_ce.fill(this.banner[PRE_TEXT_BANNER] + this.line_endings);
                }
                if (this.banner_type === TYPE_BOTH) {
                    this.read_ce.fill("--" + banner_end_boundary + this.line_endings);
                }
                if (this.banner_type === TYPE_HTML || this.banner_type === TYPE_BOTH) {
                    this.read_ce.fill("Content-Type: text/html; charset=utf8" + this.line_endings);
                    this.read_ce.fill(this.line_endings);
                    this.read_ce.fill(this.banner[PRE_HTML_BANNER] + this.line_endings);
                }
                if (this.banner_type === TYPE_BOTH) {
                    this.read_ce.fill("--" + banner_end_boundary + "--" + this.line_endings);
                }
            }

            this.read_ce.fill("--banner_" + this.uuid + this.line_endings);
            this.read_ce.fill(this.banner[ORIGINAL_CT]);
            if (this.banner[ORIGINAL_CTE]) {
                this.read_ce.fill(this.banner[ORIGINAL_CTE]);
            }
            this.read_ce.fill(this.line_endings);
        }
        // Read the message body by line
        // If we have queued entries, then we didn't 
        // create a queue file, so we read from memory.
        if (this._queue.length > 0) {
            // TODO: implement start/end offsets
            for (var i=0; i<this._queue.length; i++) {
                this.process_buf(this._queue[i].slice(0));
            }
            this._read_finish();       
        } 
        else {
            this.rs = fs.createReadStream(null, { fd: this.fd, start: 0 });
            // Prevent the file descriptor from being closed
            this.rs.destroy = function () {};
            this.rs.on('error', function (error) {
                self.emit('error', error);
            });
            this.rs.on('data', function (chunk) {
                self.process_buf(chunk);
            });
            this.rs.on('end', function () {
                self._read_finish();
            });
        }
    }
}

MessageStream.prototype.process_buf = function (buf) {
    var offset = 0;
    while ((offset = indexOfLF(buf)) !== -1) { 
        var line = buf.slice(0, offset+1);
        buf = buf.slice(line.length);
        // Don't output headers if they where sent already
        if (this.headers_done && !this.headers_found_eoh) {
            // Allow \r\n or \n here...
            if ((line.length === 2 && line[0] === 0x0d && line[1] === 0x0a) ||
                (line.length === 1 && line[0] === 0x0a)) 
            {
                this.headers_found_eoh = true;
            }
            continue;
        }
        // Remove dot-stuffing if required
        if (!this.dot_stuffing && line.length >= 4 &&
            line[0] === 0x2e && line[1] === 0x2e)
        {
            line = line.slice(1);
        }
        // We store lines in native CRLF format; so strip CR if requested
        if (this.line_endings === '\n' && line.length >= 2 &&
            line[line.length-1] === 0x0a && line[line.length-2] === 0x0d)
        {
            line[line.length-2] = 0x0a;
            line = line.slice(0, line.length-1);
        }
        this.read_ce.fill(line);
    }
    // Check for data left in the buffer
    if (buf.length > 0) {
        this.read_ce.fill(buf);
    }
}

MessageStream.prototype._read_finish = function () {
    var self = this;

    if (!this.no_banner && this.banner) {
        if (this.banner[TEXT_BANNER]) {
            this.read_ce.fill("--banner_" + this.uuid + this.line_endings);
            if (this.banner_type === TYPE_BOTH) {
                var banner_end_boundary = "banner_end_" + this.uuid;
                this.read_ce.fill("Content-Type: multipart/alternative; boundary=" + banner_end_boundary + this.line_endings);
                this.read_ce.fill(this.line_endings);
                this.read_ce.fill("--" + banner_end_boundary + this.line_endings);
            }
            if (this.banner_type === TYPE_BOTH || this.banner_type === TYPE_PLAIN) {
                this.read_ce.fill("Content-Type: text/plain" + this.line_endings);
                this.read_ce.fill(this.line_endings);
                this.read_ce.fill(this.banner[TEXT_BANNER] + this.line_endings);
            }
            if (this.banner_type === TYPE_BOTH) {
                this.read_ce.fill("--" + banner_end_boundary + this.line_endings);
            }
            if (this.banner_type === TYPE_BOTH || this.banner_type === TYPE_HTML) {
                this.read_ce.fill("Content-Type: text/html" + this.line_endings);
                this.read_ce.fill(this.line_endings);
                this.read_ce.fill(this.banner[HTML_BANNER] + this.line_endings);
            }
            if (this.banner_type === TYPE_BOTH) {
                this.read_ce.fill("--" + banner_end_boundary + "--" + this.line_endings);
            }
        }
        this.read_ce.fill("--banner_" + this.uuid + "--" + this.line_endings);
    }

    // End dot required?
    if (this.ending_dot) {
        this.read_ce.fill('.' + this.line_endings);
    }
    // Tell the chunk emitter to send whatever is left
    // We don't close the fd here so we can re-use it later.
    this.read_ce.end(function () {
        if (self.clamd_style) {
            // Add 0 length to notify end
            var buf = new Buffer(4); 
            buf.writeUInt32BE(0, 0);
            self.emit('data', buf);
        }
        self.in_pipe = false;
        self.emit('end');
    });
}

MessageStream.prototype.pipe = function (destination, options) {
    var self = this;
    if (this.in_pipe) {
        throw new Error('Cannot pipe while currently piping');
    }
    Stream.prototype.pipe.call(this, destination, options);
    // Options
    this.line_endings = ((options && options.line_endings) ? options.line_endings : "\r\n");
    this.dot_stuffing = ((options && options.dot_stuffing) ? options.dot_stuffing : false);
    this.ending_dot   = ((options && options.ending_dot) ? options.ending_dot : false);
    this.clamd_style  = ((options && options.clamd_style) ? true : false);
    this.buffer_size  = ((options && options.buffer_size) ? options.buffer_size : 1024 * 64);
    this.no_banner    = ((options && options.no_banner) ? options.no_banner : false);
    this.start        = ((options && parseInt(options.start)) ? parseInt(options.start) : 0);
    // Reset 
    this.in_pipe = true;
    this.readable = true;
    this.paused = false;
    this.headers_done = false;
    this.headers_found_eoh = false;
    this.rs = null;
    this.read_ce = new ChunkEmitter(this.buffer_size);
    this.read_ce.on('data', function (chunk) {
        if (self.clamd_style) {
            // Prefix data length to the beginning of line
            var buf = new Buffer(chunk.length+4);
            buf.writeUInt32BE(chunk.length, 0);
            chunk.copy(buf, 4);
            self.emit('data', buf);
        }
        else {
            self.emit('data', chunk);
        }
    });
    // Stream won't be readable until we've finished writing and add_line_end() has been called.
    // As we've registered for events above, the _write() function can now detect that we
    // are waiting for the data and will call _read() automatically when it is finished.
    if (!this.write_complete) return;
    // Create this.fd only if it doesn't already exist
    // This is so we can re-use the already open descriptor
    if (!this.fd && !(this._queue.length > 0)) {
        fs.open(this.filename, 'r', null, function (err, fd) {
            if (err) throw err;
            self.fd = fd;
            self._read();
        });
    }
    else {
        self._read();
    }
}

MessageStream.prototype.pause = function () {
    this.paused = true;
    if (this.rs) this.rs.pause();
}

MessageStream.prototype.resume = function () {
    this.paused = false;
    if (this.rs) {
        this.rs.resume();
    }
    else {
        this._read();
    }
}

MessageStream.prototype.destroy = function () {
    var self = this;
    try {
        if (this.fd) { 
            fs.close(this.fd, function (err) {
                fs.unlink(self.filename);
            });
        }
        else {
            fs.unlink(this.filename);
        }
    }
    catch (err) {
        // Ignore any errors
    }
}

module.exports = MessageStream;
