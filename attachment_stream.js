'use strict';

var Stream = require('stream');

class AttachmentStream extends Stream {
    constructor (header) {
        super();
        this.header = header;
        this.encoding = null;
        this.paused = false;
        this.end_emitted = false;
        this.connection = null;
        this.buffer = [];
    }
}

AttachmentStream.prototype.emit_data = function (data) {
    // console.log("YYY: DATA emit");
    if (this.paused) {
        return this.buffer.push(data);
    }

    if (this.encoding) {
        this.emit('data', data.toString(this.encoding));
    }
    else {
        this.emit('data', data);
    }
};

AttachmentStream.prototype.emit_end = function (force) {
    if (this.paused && !force) {
        // console.log("YYY: end emit (cache)");
        this.end_emitted = true;
    }
    else {
        // console.log("YYY: end emit");
        if (this.buffer.length > 0) {
            while (this.buffer.length > 0) {
                this.emit_data(this.buffer.shift());
            }
        }
        this.emit('end');
    }
};

AttachmentStream.prototype.pipe = function (dest, options) {
    var self = this;
    this.paused = false;
    Stream.prototype.pipe.call(this, dest, options);
    dest.on('drain', function () {
        // console.log("YYY: DRAIN!!!");
        if (self.paused) self.resume();
    });
    dest.on('end', function () {
        // console.log("YYY: END!!");
        if (self.paused) self.resume();
    });
    dest.on('close', function () {
        // console.log("YYY: CLOSE!!");
        if (self.paused) self.resume();
    });
};

AttachmentStream.prototype.setEncoding = function (enc) {
    if (enc !== 'binary') {
        throw "Unable to set encoding to anything other than binary";
    }
    this.encoding = enc;
};

AttachmentStream.prototype.pause = function () {
    // console.log("YYY: PAUSE!!");
    this.paused = true;
    if (this.connection) {
        // console.log("YYYY: Backpressure pause");
        this.connection.pause();
    }
};

AttachmentStream.prototype.resume = function () {
    // console.log("YYY: RESUME!!");
    if (this.connection) {
        // console.log("YYYY: Backpressure resume");
        this.connection.resume();
    }
    this.paused = false;
    if (this.buffer.length) {
        while (this.paused === false && this.buffer.length > 0) {
            this.emit_data(this.buffer.shift());
        }
        if (this.buffer.length === 0 && this.end_emitted) {
            this.emit('end');
        }
    }
    else if (this.end_emitted) {
        this.emit('end');
    }
};

AttachmentStream.prototype.destroy = function () {
    // console.log("YYYY: Stream destroyed");
};

exports.createStream = function (header) {
    return new AttachmentStream (header);
};
