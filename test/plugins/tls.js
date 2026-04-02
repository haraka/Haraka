'use strict'

const assert = require('node:assert/strict')
const path = require('node:path')
const { describe, it, beforeEach } = require('node:test')

const fixtures = require('haraka-test-fixtures')
const Plugin = fixtures.plugin

const _set_up = () => {
    this.plugin = new Plugin('tls')
    this.connection = new fixtures.connection.createConnection()

    // use test/config instead of ./config
    this.plugin.config = this.plugin.config.module_config(path.resolve('test'))
    this.plugin.net_utils.config = this.plugin.net_utils.config.module_config(path.resolve('test'))

    this.plugin.tls_opts = {}
}

describe('tls', () => {
    beforeEach(_set_up)

    const methods = ['register', 'upgrade_connection', 'advertise_starttls', 'emit_upgrade_msg']
    for (const method of methods) {
        it(`has function ${method}`, () => {
            assert.equal(typeof this.plugin[method], 'function')
        })
    }

    describe('register', () => {
        it('with certs, should register hooks', () => {
            this.plugin.register()
            assert.ok(Object.keys(this.plugin.hooks).length)
        })
    })

    describe('emit_upgrade_msg', () => {
        it('should emit a log message', () => {
            assert.equal(
                this.plugin.emit_upgrade_msg(this.connection, true, '', {
                    subject: {
                        CN: 'TLS.subject',
                        O: 'TLS.org',
                    },
                }),
                'secured: verified=true cn="TLS.subject" organization="TLS.org"',
            )
        })

        it('should emit a log message with error', () => {
            assert.equal(
                this.plugin.emit_upgrade_msg(this.connection, true, 'oops', {
                    subject: {
                        CN: 'TLS.subject',
                        O: 'TLS.org',
                    },
                }),
                'secured: verified=true error="oops" cn="TLS.subject" organization="TLS.org"',
            )
        })
    })
})
