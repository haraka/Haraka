// MessageStream class

var fs = require('fs');
var util = require('util');
var Stream = require('stream').Stream;
var ChunkEmitter = require('./chunkemitter');
var indexOfLF = require('./utils').indexOfLF;

var STATE_HEADERS = 1;
var STATE_BODY = 2;

function MessageStream (config, id, headers) {
    if (!id) throw new Error('id required');
    Stream.call(this);
    this.uuid = id;
    this.write_ce = null;
    this.read_ce = null;
    this.bytes_read = 0;
    this.state = STATE_HEADERS;
    this.idx = {};
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
}

util.inherits(MessageStream, Stream);

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
    if (this.state === STATE_HEADERS) {
        // Look for end of headers line
        if (line.length === 2 && line[0] === 0x0d && line[1] === 0x0a) {
            this.idx['headers'] = { start: 0, end: this.bytes_read-line.length };
            this.state = STATE_BODY;
            this.idx['body'] = { start: this.bytes_read };
        }
    }

    if (this.state === STATE_BODY) {
        // Look for MIME boundaries
        if (line.length > 4 && line[0] === 0x2d && line[1] == 0x2d) {
            var boundary = line.slice(2).toString().replace(/\s*$/,'');
            if (/--\s*$/.test(line)) {
                // End of boundary?
                boundary = boundary.slice(0, -2);
                if (this.idx[boundary]) {
                    this.idx[boundary]['end'] = this.bytes_read;
                }
            }
            else {
                // Start of boundary?
                if (!this.idx[boundary]) {
                    this.idx[boundary] = { start: this.bytes_read-line.length };
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
        if (this.end_called && (!this.spooling || (this.spooling && !this._queue.length))) {
            return self._write();
        }
        return true;
    }
}

/*
** READABLE STREAM
*/

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
        for (var i=0; i<this.headers.length; i++) {
            this.read_ce.fill(this.headers[i].replace(/\r?\n/g,this.line_endings));
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
            // We copy the line to a new buffer before modifying the copy
            line = new Buffer(line);
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
                fs.unlink(self.filename, function () {});
            });
        }
        else {
            fs.unlink(this.filename, function () {});
        }
    }
    catch (err) {
        // Ignore any errors
    }
}

MessageStream.prototype.get_data = function (cb) { // Or: (options, cb)
    var options = {};
    if (arguments.length === 2) {
        cb = arguments[1];
        options = arguments[0];
    }
    var ws = new GetDataStream(cb);
    this.pipe(ws, options);
}

module.exports = MessageStream;


function GetDataStream (cb) {
    this.cb = cb;
    this.buf = '';
    this.writable = true;
}

util.inherits(GetDataStream, Stream);

GetDataStream.prototype.write = function (obj, enc) {
    this.buf += obj;
    return true;
}

GetDataStream.prototype.end = function (obj, enc) {
    if (obj)
        this.buf += obj;
    this.cb(this.buf);
}

GetDataStream.prototype.destroy = function () {
    // ignore
}

GetDataStream.prototype.destroySoon = function () {
    // ignore
}
