'use strict'

const fs = require('node:fs/promises')
const { WriteStream } = require('node:fs')

class FsyncWriteStream extends WriteStream {
    constructor(path, options) {
        super(path, options)
    }

    close(cb) {
        const self = this
        if (cb) this.once('close', cb)

        if (this.closed || 'number' !== typeof this.fd) {
            if ('number' !== typeof this.fd) {
                this.once('open', close)
                return
            }
            return setImmediate(this.emit.bind(this, 'close'))
        }
        this.closed = true
        close()

        function close(fd) {
            const targetFd = fd || self.fd

            fs.fsync(targetFd)
                .then(() => fs.close(targetFd))
                .then(() => {
                    self.emit('close')
                })
                .catch((err) => {
                    self.emit('error', err)
                })
                .finally(() => {
                    self.fd = null
                })
        }
    }
}

module.exports = FsyncWriteStream
