'use strict'

const assert = require('node:assert/strict')
const { describe, it, beforeEach } = require('node:test')

const { makeConnection, makePlugin } = require('haraka-test-fixtures')

describe('auth/auth_proxy', () => {
    let plugin, connection, proxied

    const withDomains = (domains) => {
        plugin.config.get = (name) => (name === 'auth_proxy.ini' ? { main: {}, domains } : { main: {} })
    }

    beforeEach(() => {
        plugin = makePlugin('auth/auth_proxy', { register: false })
        plugin.inherits('auth/auth_base')
        connection = makeConnection()
        proxied = null
        plugin.try_auth_proxy = (conn, hosts) => {
            // the plugin is compiled in a vm context, so an array it built has a
            // foreign Array.prototype that assert/strict will not match
            proxied = hosts === null ? null : [...hosts]
        }
    })

    describe('check_plain_passwd', () => {
        it('rejects a username with no domain', (t, done) => {
            withDomains({})
            plugin.check_plain_passwd(connection, 'matt', 'pw', (valid) => {
                assert.equal(valid, false)
                assert.equal(proxied, null)
                done()
            })
        })

        it('proxies a configured domain', (t, done) => {
            withDomains({ 'test.com': '1.2.3.4' })
            plugin.check_plain_passwd(connection, 'matt@test.com', 'pw', () => {})
            assert.deepEqual(proxied, ['1.2.3.4'])
            done()
        })

        it('splits a multi-host route', (t, done) => {
            withDomains({ 'test.com': '1.2.3.4, 5.6.7.8;9.10.11.12' })
            plugin.check_plain_passwd(connection, 'matt@test.com', 'pw', () => {})
            assert.deepEqual(proxied, ['1.2.3.4', '', '5.6.7.8', '9.10.11.12'])
            done()
        })

        it('accepts an array route without throwing', (t, done) => {
            withDomains({ 'test.com': ['1.2.3.4', '5.6.7.8'] })
            plugin.check_plain_passwd(connection, 'matt@test.com', 'pw', () => {})
            assert.deepEqual(proxied, ['1.2.3.4', '5.6.7.8'])
            done()
        })

        it('does not consume the cached config array across attempts', (t, done) => {
            const domains = { 'test.com': ['1.2.3.4', '5.6.7.8'] }
            withDomains(domains)
            plugin.check_plain_passwd(connection, 'matt@test.com', 'pw', () => {})
            assert.deepEqual(proxied, ['1.2.3.4', '5.6.7.8'])
            // the route object the config handed us must be untouched
            assert.deepEqual(domains['test.com'], ['1.2.3.4', '5.6.7.8'])
            proxied = null
            plugin.check_plain_passwd(connection, 'matt@test.com', 'pw', () => {})
            assert.deepEqual(proxied, ['1.2.3.4', '5.6.7.8'], 'second attempt sees the full route')
            done()
        })

        it('try_auth_proxy does not mutate the array it is given', (t, done) => {
            const hosts = ['bad host', 'also bad']
            const before = [...hosts]
            plugin.try_auth_proxy = require('../../../plugins/auth/auth_proxy.js').try_auth_proxy
            // every entry is an invalid endpoint, so it walks the whole list and fails
            plugin.try_auth_proxy(connection, hosts, 'u', 'p', (valid) => {
                assert.equal(valid, false)
                assert.deepEqual(hosts, before, 'input array unchanged')
                done()
            })
        })

        it('rejects an unconfigured domain', (t, done) => {
            withDomains({ 'test.com': '1.2.3.4' })
            plugin.check_plain_passwd(connection, 'matt@other.com', 'pw', (valid) => {
                assert.equal(valid, false)
                assert.equal(proxied, null)
                done()
            })
        })

        // The AUTH username is raw client input, never validated as an address, so
        // unlike an envelope domain it really can be `__proto__`. A bare lookup
        // returned a truthy inherited member and then threw on .split().
        for (const name of ['__proto__', 'constructor', 'valueOf', 'toString', 'hasOwnProperty']) {
            it(`rejects inherited domain '${name}' without throwing`, (t, done) => {
                withDomains({})
                assert.doesNotThrow(() => {
                    plugin.check_plain_passwd(connection, `matt@${name}`, 'pw', (valid) => {
                        assert.equal(valid, false)
                        assert.equal(proxied, null)
                        done()
                    })
                })
            })
        }

        it('rejects a non-string route instead of throwing', (t, done) => {
            withDomains({ 'test.com': 2525 })
            assert.doesNotThrow(() => {
                plugin.check_plain_passwd(connection, 'matt@test.com', 'pw', (valid) => {
                    assert.equal(valid, false)
                    done()
                })
            })
        })

        it('rejects rather than throwing when [domains] is absent', (t, done) => {
            plugin.config.get = () => ({ main: {} })
            assert.doesNotThrow(() => {
                plugin.check_plain_passwd(connection, 'matt@test.com', 'pw', (valid) => {
                    assert.equal(valid, false)
                    done()
                })
            })
        })
    })
})
