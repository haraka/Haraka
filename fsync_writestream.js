"use strict";

var fs      = require('fs');
var util    = require('util');

module.exports = FsyncWriteStream;

function FsyncWriteStream (path, options) {
    if (!(this instanceof FsyncWriteStream)) return new FsyncWriteStream(path, options);

    fs.WriteStream.call(this, path, options);
}

util.inherits(FsyncWriteStream, fs.WriteStream);

FsyncWriteStream.prototype.close = function(cb) {
    var self = this;
    if (cb)
        this.once('close', cb);
    if (this.closed || 'number' !== typeof this.fd) {
        if ('number' !== typeof this.fd) {
            this.once('open', close);
            return;
        }
        return process.nextTick(this.emit.bind(this, 'close'));
    }
    this.closed = true;
    close();

    function close(fd) {
        fs.fsync(fd || self.fd, function(er) {
            if (er) {
                self.emit('error', er);
            }
            else {
                fs.close(fd || self.fd, function(err) {
                    if (err) {
                        self.emit('error', err);
                    }
                    else {
                        self.emit('close');
                    }
                });
                self.fd = null;
            }
        });
    }
};
