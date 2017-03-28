'use strict';

var fs      = require('fs');
var util    = require('util');

class FsyncWriteStream extends fs.WriteStream {
    constructor(path, options) {
        super(path, options);
    }
}

FsyncWriteStream.prototype.close = function (cb) {
    var self = this;
    if (cb)
        this.once('close', cb);
    if (this.closed || 'number' !== typeof this.fd) {
        if ('number' !== typeof this.fd) {
            this.once('open', close);
            return;
        }
        return setImmediate(this.emit.bind(this, 'close'));
    }
    this.closed = true;
    close();

    function close (fd) {
        fs.fsync(fd || self.fd, function (er) {
            if (er) {
                self.emit('error', er);
            }
            else {
                fs.close(fd || self.fd, function (err) {
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

module.exports = FsyncWriteStream;

