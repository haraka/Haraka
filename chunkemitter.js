'use strict';

var EventEmitter = require('events').EventEmitter;

class ChunkEmitter extends EventEmitter {
    constructor (buffer_size) {
        super();
        this.buffer_size = parseInt(buffer_size) || (64 * 1024);
        this.buf = null;
        this.pos = 0;
        this.bufs = [];
        this.bufs_size = 0;
    }
}

ChunkEmitter.prototype.fill = function (input) {
    if (typeof input === 'string') {
        input = new Buffer(input);
    }

    // Optimization: don't allocate a new buffer until
    // the input we've had so far is bigger than our
    // buffer size.
    if (!this.buf) {
        // We haven't allocated a buffer yet
        this.bufs.push(input);
        this.bufs_size += input.length;
        if ((input.length + this.bufs_size) > this.buffer_size) {
            this.buf = new Buffer(this.buffer_size);
            var in_new = Buffer.concat(this.bufs, this.bufs_size);
            input = in_new;
            // Reset
            this.bufs = [];
            this.bufs_size = 0;
        }
        else {
            return;
        }
    }

    while (input.length > 0) {
        var remaining = this.buffer_size - this.pos;
        if (remaining === 0) {
            this.emit('data', this.buf); //.slice(0));
            this.buf = new Buffer(this.buffer_size);
            this.pos = 0;
            remaining = this.buffer_size;
        }
        var to_write = ((remaining > input.length) ? input.length : remaining);
        input.copy(this.buf, this.pos, 0, to_write);
        this.pos += to_write;
        input = input.slice(to_write);
    }
};

ChunkEmitter.prototype.end = function (cb) {
    var emitted = false;
    if (this.bufs_size > 0) {
        this.emit('data', Buffer.concat(this.bufs, this.bufs_size));
        emitted = true;
    }
    else if (this.pos > 0) {
        this.emit('data', this.buf.slice(0, this.pos));
        emitted = true;
    }
    // Reset
    this.buf = null;
    this.pos = 0;
    this.bufs = [];
    this.bufs_size = 0;
    if (cb && typeof cb === 'function') cb();
    return emitted;
};

module.exports = ChunkEmitter;
