'use strict'
// Socket address parser/formatter and server binding helper

const fs = require('node:fs/promises')
const net = require('node:net')

function parseSockaddr(addr, defaultPort = 0) {
    let match
    if (/^[0-9]+$/.test(addr)) return { host: '::', port: parseInt(addr, 10) }

    const lastColon = addr.lastIndexOf(':')
    if (lastColon !== -1) {
        const host = addr.slice(0, lastColon)
        const port = addr.slice(lastColon + 1)

        if (host.includes(':') && /^\d+$/.test(port) && net.isIP(host) === 6) {
            return { host: host.toLowerCase(), port: parseInt(port, 10) }
        }
    }
    if (net.isIP(addr) === 6) return { host: addr.toLowerCase(), port: defaultPort }

    if ((match = /^(\d{1,3}(?:\.\d{1,3}){3})(?::(\d+))?$/.exec(addr)))
        return { host: match[1], port: match[2] !== undefined ? parseInt(match[2], 10) : defaultPort }
    if ((match = /^\[([0-9a-fA-F:]+)\](?::(\d+))?$/.exec(addr)))
        return { host: match[1].toLowerCase(), port: match[2] !== undefined ? parseInt(match[2], 10) : defaultPort }
    if (
        (match =
            /^([a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?)*)(?::(\d+))?$/.exec(
                addr,
            ))
    )
        return { host: match[1].toLowerCase(), port: match[2] !== undefined ? parseInt(match[2], 10) : defaultPort }
    if (addr.includes('/')) return { path: addr }
    throw new Error(`Invalid socket address ${addr}`)
}

module.exports = function endpoint(addr, defaultPort) {
    try {
        if ('string' === typeof addr || 'number' === typeof addr) {
            addr = parseSockaddr(addr, defaultPort)
            const match = /^(.*):([0-7]{3})$/.exec(addr.path || '')
            if (match) {
                addr.path = match[1]
                addr.mode = match[2]
            }
        }
    } catch (err) {
        // Return the parse exception instead of throwing it
        return err
    }
    return new Endpoint(addr)
}

class Endpoint {
    constructor(addr) {
        if (addr.path) {
            this.path = addr.path
            if (addr.mode) this.mode = addr.mode
        } else {
            // Handle server.address() return as well as parsed host/port
            const host = addr.address || addr.host || '::0'
            // Normalize '::' to '::0'
            this.host = '::' === host ? '::0' : host
            this.port = parseInt(addr.port, 10)
        }
    }

    toString() {
        if (this.mode) return `${this.path}:${this.mode}`
        if (this.path) return this.path
        if (this.host.includes(':')) return `[${this.host}]:${this.port}`
        return `${this.host}:${this.port}`
    }

    // Make server listen on this endpoint, w/optional options
    async bind(server, opts) {
        opts = { ...opts }

        const mode = this.mode ? parseInt(this.mode, 8) : false
        if (this.path) {
            opts.path = this.path
            await fs.rm(this.path, { force: true }) // errors are ignored when force is true
        } else {
            opts.host = this.host
            opts.port = this.port
        }

        return new Promise((resolve, reject) => {
            server.listen(opts, async (err) => {
                if (err) return reject(err)
                if (mode) await fs.chmod(opts.path, mode)
                resolve()
            })
        })
    }
}
