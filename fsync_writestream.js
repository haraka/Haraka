"use strict";

var fs      = require('fs');
var util    = require('util');

module.exports = FsyncWriteStream;

function FsyncWriteStream (path, options) {
    if (!(this instanceof FsyncWriteStream)) return new FsyncWriteStream(path, options);

    fs.WriteStream.call(this, path, options);
}

util.inherits(FsyncWriteStream, fs.WriteStream);

var versions   = process.version.split('.'),
    version    = Number(versions[0].substring(1)),
    subversion = Number(versions[1]);

if (version > 0 || subversion >= 10) {
    // for v0.10+ compat
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
                if (er)
                self.emit('error', er);
                else {
                    fs.close(fd || self.fd, function(er) {
                        if (er)
                        self.emit('error', er);
                        else
                        self.emit('close');
                    });
                    self.fd = null;
                }
            })
        }
    };
}
else {
    FsyncWriteStream.prototype.flush = function() {
        if (this.busy) return;
        var self = this;

        var args = this._queue.shift();
        if (!args) {
            if (this.drainable) { this.emit('drain'); }
            return;
        }

        this.busy = true;

        var method = args.shift(),
            cb = args.pop();

        args.push(function(err) {
            self.busy = false;

            if (err) {
                self.writable = false;
                if (cb) {
                    cb(err);
                }
                self.emit('error', err);
                return;
            }

            if (method == fs.write) {
                self.bytesWritten += arguments[1];
                if (cb) {
                    // write callback
                    cb(null, arguments[1]);
                }

            } else if (method === self._open) {
                // save reference for file pointer
                self.fd = arguments[1];
                self.emit('open', self.fd);

            } else if (method === fs.close) {
                // stop flushing after close
                if (cb) {
                    cb(null);
                }
                self.emit('close');
                return;
            } else if (method === fs.fsync) {
                // XXX: New code compared to WriteStream.flush
                // stop flushing after fsync
                if (cb) {
                    cb(null);
                }
                return;
            }

            self.flush();
        });

        // Inject the file pointer
        if (method !== self._open) {
            args.unshift(this.fd);
        }

        method.apply(this, args);
    };

    FsyncWriteStream.prototype.end = function(data, encoding, cb) {
        if (typeof(data) === 'function') {
            cb = data;
        } else if (typeof(encoding) === 'function') {
            cb = encoding;
            this.write(data);
        } else if (arguments.length > 0) {
            this.write(data, encoding);
        }
        this.writable = false;
        // XXX: New code compared to WriteStream.flush
        var self = this;
        var fsync_cb = function (err) {
            if (err) return cb(err);
            self._queue.push([fs.close, cb]);
            self.flush();
        }
        this._queue.push([fs.fsync, fsync_cb]);
        this.flush();
    };
}

