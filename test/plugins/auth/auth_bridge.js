'use strict'

const assert = require('node:assert')
const { describe, it, beforeEach } = require('node:test')

const fixtures = require('haraka-test-fixtures')

describe('auth/auth_bridge', () => {
    let plugin

    beforeEach(() => {
        plugin = new fixtures.plugin('auth/auth_bridge')
        plugin.load_flat_ini()
    })

    describe('load_flat_ini', () => {
        it('loads smtp_bridge.ini config', () => {
            assert.ok(plugin.cfg)
            assert.ok(plugin.cfg.main)
        })

        it('cfg.main.host defaults to localhost', () => {
            assert.equal(plugin.cfg.main.host, 'localhost')
        })
    })

    describe('check_plain_passwd', () => {
        let conn

        beforeEach(() => {
            conn = fixtures.connection.createConnection()
        })

        it('calls try_auth_proxy with just host when no port configured', (t, done) => {
            plugin.cfg.main = { host: 'mail.example.com' }
            plugin.try_auth_proxy = (connection, host, user, passwd, cb) => {
                assert.equal(host, 'mail.example.com')
                assert.equal(user, 'testuser')
                assert.equal(passwd, 'testpass')
                cb(true)
            }
            plugin.check_plain_passwd(conn, 'testuser', 'testpass', (result) => {
                assert.equal(result, true)
                done()
            })
        })

        it('calls try_auth_proxy with host:port when port is configured', (t, done) => {
            plugin.cfg.main = { host: 'mail.example.com', port: '587' }
            plugin.try_auth_proxy = (connection, host, user, passwd, cb) => {
                assert.equal(host, 'mail.example.com:587')
                cb(true)
            }
            plugin.check_plain_passwd(conn, 'testuser', 'testpass', (result) => {
                assert.equal(result, true)
                done()
            })
        })

        it('passes authentication failure through to callback', (t, done) => {
            plugin.cfg.main = { host: 'mail.example.com' }
            plugin.try_auth_proxy = (connection, host, user, passwd, cb) => {
                cb(false)
            }
            plugin.check_plain_passwd(conn, 'baduser', 'badpass', (result) => {
                assert.equal(result, false)
                done()
            })
        })

        it('passes the connection object to try_auth_proxy', (t, done) => {
            plugin.cfg.main = { host: 'mail.example.com' }
            plugin.try_auth_proxy = (connection, host, user, passwd, cb) => {
                assert.equal(connection, conn)
                cb(true)
            }
            plugin.check_plain_passwd(conn, 'user', 'pass', () => done())
        })
    })
})
