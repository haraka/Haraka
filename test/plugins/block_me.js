'use strict'

const fs = require('node:fs')
const path = require('node:path')
const assert = require('node:assert/strict')
const { describe, it, beforeEach, after } = require('node:test')

const fixtures = require('haraka-test-fixtures')
const { Address } = require('address-rfc2821')
require('haraka-constants').import(global)

// block_me appends to <config>/mail_from.blocklist when a sender is blocked;
// remove the artifact the 'sets block_me note' test produces.
after(() => {
    fs.rmSync(path.resolve('test/config/mail_from.blocklist'), { force: true })
})

function makeConnection({
    relaying = false,
    mailFrom = 'sender@example.com',
    rcptTo = ['blocklist@example.com'],
} = {}) {
    const conn = fixtures.connection.createConnection()
    conn.init_transaction()
    conn.relaying = relaying
    conn.transaction.mail_from = new Address(`<${mailFrom}>`)
    conn.transaction.rcpt_to = rcptTo.map((r) => new Address(`<${r}>`))
    conn.transaction.body = { bodytext: '', children: [] }
    return conn
}

describe('block_me', () => {
    let plugin

    // Read config (block_me.recipient, block_me.senders) from test/config rather
    // than the real config dir. block_me also appends matched senders to
    // mail_from.blocklist; with this override that write lands in test/config too.
    beforeEach(() => {
        plugin = new fixtures.plugin('block_me')
        plugin.config = plugin.config.module_config(path.resolve('test'))
    })

    describe('hook_data', () => {
        it('enables body parsing and calls next', (t, done) => {
            const conn = makeConnection()
            conn.transaction.parse_body = false
            plugin.hook_data((rc) => {
                assert.equal(rc, undefined)
                assert.equal(conn.transaction.parse_body, true)
                done()
            }, conn)
        })
    })

    describe('hook_data_post', () => {
        it('calls next when not relaying', (t, done) => {
            const conn = makeConnection({ relaying: false })
            plugin.hook_data_post((rc) => {
                assert.equal(rc, undefined)
                done()
            }, conn)
        })

        it('calls next when transaction is missing', (t, done) => {
            const conn = fixtures.connection.createConnection()
            conn.relaying = true
            conn.transaction = null
            plugin.hook_data_post((rc) => {
                assert.equal(rc, undefined)
                done()
            }, conn)
        })

        it('calls next when more than one recipient', (t, done) => {
            const conn = makeConnection({
                relaying: true,
                rcptTo: ['blocklist@example.com', 'other@example.com'],
            })
            plugin.hook_data_post((rc) => {
                assert.equal(rc, undefined)
                done()
            }, conn)
        })

        it('calls next when recipient does not match configured address', (t, done) => {
            const conn = makeConnection({ relaying: true, rcptTo: ['other@example.com'] })
            plugin.hook_data_post((rc) => {
                assert.equal(rc, undefined)
                done()
            }, conn)
        })

        it('denies when sender is not in the allowed senders list', (t, done) => {
            const conn = makeConnection({
                relaying: true,
                mailFrom: 'notallowed@example.com',
                rcptTo: ['blocklist@example.com'],
            })
            plugin.hook_data_post((rc, msg) => {
                assert.equal(rc, DENY)
                assert.ok(msg.includes('not allowed'))
                done()
            }, conn)
        })

        it('calls next when no From header found in body', (t, done) => {
            const conn = makeConnection({
                relaying: true,
                mailFrom: 'sender@example.com',
                rcptTo: ['blocklist@example.com'],
            })
            conn.transaction.body = { bodytext: 'No from header here', children: [] }
            plugin.hook_data_post((rc) => {
                assert.equal(rc, undefined)
                // note should not be set since no From header
                assert.equal(conn.transaction.notes.block_me, undefined)
                done()
            }, conn)
        })

        it('sets block_me note and calls next when From is extracted', (t, done) => {
            const conn = makeConnection({
                relaying: true,
                mailFrom: 'sender@example.com',
                rcptTo: ['blocklist@example.com'],
            })
            conn.transaction.body = {
                bodytext: 'From: Test User <block_target@example.com>',
                children: [],
            }
            plugin.hook_data_post((rc) => {
                assert.equal(rc, undefined)
                assert.equal(conn.transaction.notes.block_me, 1)
                done()
            }, conn)
        })
    })

    describe('hook_queue', () => {
        it('returns OK when block_me note is set on transaction', (t, done) => {
            const conn = makeConnection()
            conn.transaction.notes.block_me = 1
            plugin.hook_queue((rc) => {
                assert.equal(rc, OK)
                done()
            }, conn)
        })

        it('calls next when block_me note is not set', (t, done) => {
            const conn = makeConnection()
            plugin.hook_queue((rc) => {
                assert.equal(rc, undefined)
                done()
            }, conn)
        })
    })
})
