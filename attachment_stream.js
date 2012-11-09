"use strict";

var Stream = require('stream');
var util   = require('util');

function AttachmentStream () {
    Stream.call(this);
    this.encoding = null;
    this.paused = false;
}

util.inherits(AttachmentStream, Stream);

AttachmentStream.prototype.emit_data = function (data) {
    // console.log("DATA emit");
    if (this.encoding) {
        this.emit('data', data.toString(this.encoding));
    }
    else {
        this.emit('data', data);
    }
}

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
    })
    dest.on('close', function () {
        // console.log("YYY: CLOSE!!");
        if (self.paused) self.resume();
    })
}

AttachmentStream.prototype.setEncoding = function (enc) {
    if (enc !== 'binary') {
        throw "Unable to set encoding to anything other than binary";
    }
    this.encoding = enc;
}

AttachmentStream.prototype.pause = function () {
    this.paused = true;
    if (this.connection && this.connection.client && this.connection.client.pause) {
        // console.log("YYYY: Backpressure pause");
        this.connection.client.pause();
    }
}

AttachmentStream.prototype.resume = function () {
    if (this.connection && this.connection.client && this.connection.client.resume) {
        // console.log("YYYY: Backpressure resume");
        this.connection.client.resume();
    }
    this.paused = false;
}

AttachmentStream.prototype.destroy = function () {
    // console.log("YYYY: Stream destroyed");
}

exports.createStream = function () {
    return new AttachmentStream ();
}
