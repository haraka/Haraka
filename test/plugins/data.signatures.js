'use strict'

const assert = require('node:assert/strict')
const { describe, it, beforeEach } = require('node:test')

const { makeConnection, makePlugin } = require('haraka-test-fixtures')
require('haraka-constants').import(global)

function buildConnection(bodytext = '', children = []) {
    const conn = makeConnection()
    conn.init_transaction()
    conn.transaction.body = { bodytext, children }
    return conn
}

describe('data.signatures', () => {
    let plugin

    beforeEach(() => {
        plugin = makePlugin('data.signatures', { register: false })
    })

    describe('hook_data', () => {
        it('enables body parsing', (t, done) => {
            const conn = buildConnection()
            conn.transaction.parse_body = false
            plugin.hook_data((rc) => {
                assert.equal(rc, undefined)
                assert.equal(conn.transaction.parse_body, true)
                done()
            }, conn)
        })

        it('calls next when there is no transaction', (t, done) => {
            const conn = makeConnection()
            conn.transaction = null
            plugin.hook_data((rc) => {
                assert.equal(rc, undefined)
                done()
            }, conn)
        })
    })

    describe('hook_data_post', () => {
        it('calls next when there is no transaction', (t, done) => {
            const conn = makeConnection()
            conn.transaction = null
            plugin.hook_data_post((rc) => {
                assert.equal(rc, undefined)
                done()
            }, conn)
        })

        it('calls next when signature list is empty', (t, done) => {
            plugin.config.get = (name, type) => (type === 'list' ? [] : {})
            const conn = buildConnection('This is some email body text')
            plugin.hook_data_post((rc) => {
                assert.equal(rc, undefined)
                done()
            }, conn)
        })

        it('denies when body matches a signature', (t, done) => {
            plugin.config.get = (name, type) => (type === 'list' ? ['spam_signature_text'] : {})
            const conn = buildConnection('Buy cheap meds! spam_signature_text here')
            plugin.hook_data_post((rc, msg) => {
                assert.equal(rc, DENY)
                assert.ok(msg.includes('spam'))
                done()
            }, conn)
        })

        it('calls next when body does not match any signature', (t, done) => {
            plugin.config.get = (name, type) => (type === 'list' ? ['bad_pattern'] : {})
            const conn = buildConnection('Totally normal email body')
            plugin.hook_data_post((rc) => {
                assert.equal(rc, undefined)
                done()
            }, conn)
        })

        it('denies when a child body part matches a signature', (t, done) => {
            plugin.config.get = (name, type) => (type === 'list' ? ['spam_in_child'] : {})
            const conn = makeConnection()
            conn.init_transaction()
            conn.transaction.body = {
                bodytext: 'clean parent text',
                children: [{ bodytext: 'spam_in_child content here', children: [] }],
            }
            plugin.hook_data_post((rc) => {
                assert.equal(rc, DENY)
                done()
            }, conn)
        })

        it('calls next when multiple signatures do not match', (t, done) => {
            plugin.config.get = (name, type) => (type === 'list' ? ['sig_one', 'sig_two', 'sig_three'] : {})
            const conn = buildConnection('No matching signatures here at all')
            plugin.hook_data_post((rc) => {
                assert.equal(rc, undefined)
                done()
            }, conn)
        })

        it('matches the first of multiple signatures', (t, done) => {
            plugin.config.get = (name, type) => (type === 'list' ? ['no_match', 'buy_cheap_pills'] : {})
            const conn = buildConnection('This message has buy_cheap_pills for you')
            plugin.hook_data_post((rc) => {
                assert.equal(rc, DENY)
                done()
            }, conn)
        })
    })
})
