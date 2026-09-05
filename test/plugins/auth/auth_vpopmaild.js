'use strict'

const assert = require('node:assert/strict')
const path = require('node:path')
const { describe, it, beforeEach } = require('node:test')

const { makeConnection, makePlugin } = require('haraka-test-fixtures')

const _set_up = () => {
    this.backup = {}

    this.plugin = makePlugin('auth/auth_vpopmaild', { register: false })
    this.plugin.inherits('auth/auth_base')

    // reset the config/root_path
    this.plugin.config.root_path = path.resolve(__dirname, '../../../config')
    this.plugin.cfg = this.plugin.config.get('auth_vpopmaild.ini')

    this.connection = makeConnection()
    this.connection.capabilities = null
}

describe('hook_capabilities', () => {
    beforeEach(_set_up)

    it('no TLS', (t, done) => {
        this.plugin.hook_capabilities((rc, msg) => {
            assert.equal(undefined, rc)
            assert.equal(undefined, msg)
            assert.equal(null, this.connection.capabilities)
            done()
        }, this.connection)
    })

    it('with TLS', (t, done) => {
        this.connection.tls.enabled = true
        this.connection.capabilities = []
        this.plugin.hook_capabilities((rc, msg) => {
            assert.equal(undefined, rc)
            assert.equal(undefined, msg)
            assert.ok(this.connection.capabilities.length)
            done()
        }, this.connection)
    })

    it('with TLS, sysadmin', (t, done) => {
        this.connection.tls.enabled = true
        this.connection.capabilities = []
        this.plugin.hook_capabilities((rc, msg) => {
            assert.equal(undefined, rc)
            assert.equal(undefined, msg)
            assert.ok(this.connection.capabilities.length)
            done()
        }, this.connection)
    })
})

describe('get_vpopmaild_socket', () => {
    beforeEach(_set_up)

    it('any', () => {
        const socket = this.plugin.get_vpopmaild_socket('foo@localhost.com')
        assert.ok(socket)
        socket.destroy()
    })
})

describe('get_plain_passwd', () => {
    beforeEach(_set_up)

    it('matt@example.com', (t, done) => {
        if (this.plugin.cfg['example.com'].sysadmin) {
            this.plugin.get_plain_passwd('matt@example.com', (pass) => {
                assert.ok(pass)
                done()
            })
        } else {
            done()
        }
    })
})

describe('get_sock_opts prototype members', () => {
    beforeEach(_set_up)

    for (const name of ['__proto__', 'constructor', 'valueOf', 'toString', 'hasOwnProperty']) {
        it(`user '@${name}' does not select an inherited section`, () => {
            this.plugin.cfg = { main: { host: '10.9.8.7', port: 8900, sysadmin: 'a:b' } }
            const opts = this.plugin.get_sock_opts(`matt@${name}`)
            assert.equal(opts.host, '10.9.8.7')
            assert.equal(opts.port, 8900)
            assert.equal(opts.sysadmin, 'a:b')
        })
    }

    it('still selects a configured domain section', () => {
        this.plugin.cfg = { main: { host: '10.9.8.7' }, 'test.com': { host: '1.2.3.4' } }
        assert.equal(this.plugin.get_sock_opts('matt@test.com').host, '1.2.3.4')
    })

    it('does not open a socket when sysadmin is missing', (t, done) => {
        this.plugin.cfg = { main: { host: '127.0.0.1', port: 89 } }
        let opened = false
        this.plugin.get_vpopmaild_socket = () => {
            opened = true
            return null
        }
        this.plugin.get_plain_passwd('matt@example.com', this.connection, (pw) => {
            assert.equal(pw, null)
            assert.equal(opened, false, 'socket must not be opened before the sysadmin check')
            done()
        })
    })
})
