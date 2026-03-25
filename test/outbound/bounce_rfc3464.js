'use strict'

// Testing bounce email contents related to errors occurring during SMTP dialog.
// These tests simulate a remote SMTP server responding with various error codes
// and verify that Haraka generates correctly formatted RFC 3464 DSN bounce messages.

const { describe, it, beforeEach, afterEach } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')

// Load outbound/index FIRST to avoid the circular-dependency boot-order issue.
const outbound = require('../../outbound')
const HMailItem = outbound.HMailItem
const TODOItem = require('../../outbound/todo')
const obc = require('../../outbound/config')

const util_hmailitem = require('../fixtures/util_hmailitem')
const mock_sock = require('../fixtures/line_socket')

obc.cfg.pool_concurrency_max = 0

const outbound_context = { TODOItem, exports: outbound }
const queue_dir = path.resolve(__dirname, '../test-queue')

// ── Helpers ───────────────────────────────────────────────────────────────────

const ensureQueueDir = () =>
    new Promise((resolve, reject) => {
        fs.exists(queue_dir, (exists) => {
            if (exists) return resolve()
            fs.mkdir(queue_dir, (err) => (err ? reject(err) : resolve()))
        })
    })

const cleanQueueDir = () =>
    new Promise((resolve, reject) => {
        fs.exists(queue_dir, (exists) => {
            if (!exists) return resolve()
            try {
                for (const file of fs.readdirSync(queue_dir)) {
                    const full = path.resolve(queue_dir, file)
                    if (fs.lstatSync(full).isDirectory()) return reject(new Error(`unexpected subdirectory: ${full}`))
                    fs.unlinkSync(full)
                }
                resolve()
            } catch (err) {
                reject(err)
            }
        })
    })

const mockHMailItem = (ctx, opts = {}) =>
    new Promise((resolve, reject) => {
        util_hmailitem.newMockHMailItem(ctx, reject, opts, resolve)
    })

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('outbound_bounce_rfc3464', () => {
    beforeEach(ensureQueueDir)
    afterEach(cleanQueueDir)

    it('MAIL FROM 500 triggers RFC3464 bounce with status 5.0.0', async () => {
        const mock_hmail = await mockHMailItem(outbound_context)
        const mock_socket = mock_sock.connect('testhost', 'testport')
        mock_socket.writable = true

        await new Promise((resolve, reject) => {
            const orig = outbound_context.exports.send_email
            outbound_context.exports.send_email = (from, to, contents, cb, opts) => {
                try {
                    assert.match(contents, /^Content-type: message\/delivery-status/m)
                    assert.match(contents, /^Final-Recipient: rfc822;recipient@domain/m)
                    assert.match(contents, /^Action: failed/m)
                    assert.match(contents, /^Status: 5\.0\.0/m)
                    assert.match(contents, /Absolutely not acceptable\. Basic Test Only\./)
                    resolve()
                } catch (e) {
                    reject(e)
                } finally {
                    outbound_context.exports.send_email = orig
                }
            }
            util_hmailitem.playTestSmtpConversation(mock_hmail, mock_socket, reject, [
                { from: 'remote', line: '220 testing-smtp' },
                { from: 'haraka', test: (l) => l.match(/^EHLO /), description: 'EHLO' },
                { from: 'remote', line: '220-testing-smtp' },
                { from: 'remote', line: '220 8BITMIME' },
                { from: 'haraka', test: 'MAIL FROM:<sender@domain>' },
                { from: 'remote', line: '500 5.0.0 Absolutely not acceptable. Basic Test Only.' },
                { from: 'haraka', test: 'QUIT', end_test: true },
            ], () => {})
        })
    })

    it('early 3XX response triggers temp_fail with status 3.0.0', async () => {
        const mock_hmail = await mockHMailItem(outbound_context)
        const mock_socket = mock_sock.connect('testhost', 'testport')
        mock_socket.writable = true

        await new Promise((resolve, reject) => {
            const orig = HMailItem.prototype.temp_fail
            HMailItem.prototype.temp_fail = function (err, opts) {
                try {
                    assert.equal(this.todo.rcpt_to[0].dsn_status, '3.0.0')
                    assert.equal(this.todo.rcpt_to[0].dsn_action, 'delayed')
                    assert.match(this.todo.rcpt_to[0].dsn_smtp_response, /No time for you right now/)
                    resolve()
                } catch (e) {
                    reject(e)
                } finally {
                    HMailItem.prototype.temp_fail = orig
                }
            }
            util_hmailitem.playTestSmtpConversation(mock_hmail, mock_socket, reject, [
                { from: 'remote', line: '220 testing-smtp' },
                { from: 'haraka', test: (l) => l.match(/^EHLO /), description: 'EHLO' },
                { from: 'remote', line: '220-testing-smtp' },
                { from: 'remote', line: '220 8BITMIME' },
                { from: 'haraka', test: 'MAIL FROM:<sender@domain>' },
                { from: 'remote', line: '300 3.0.0 No time for you right now' },
                { from: 'haraka', test: 'QUIT', end_test: true },
            ], () => {})
        })
    })

    it('RCPT-TO 4XX triggers temp_fail with status 4.0.0', async () => {
        const mock_hmail = await mockHMailItem(outbound_context)
        const mock_socket = mock_sock.connect('testhost', 'testport')
        mock_socket.writable = true

        await new Promise((resolve, reject) => {
            const orig = HMailItem.prototype.temp_fail
            HMailItem.prototype.temp_fail = function (err, opts) {
                try {
                    assert.equal(this.todo.rcpt_to[0].dsn_status, '4.0.0')
                    assert.equal(this.todo.rcpt_to[0].dsn_action, 'delayed')
                    assert.match(this.todo.rcpt_to[0].dsn_smtp_response, /Currently not available\. Try again later\./)
                    resolve()
                } catch (e) {
                    reject(e)
                } finally {
                    HMailItem.prototype.temp_fail = orig
                }
            }
            util_hmailitem.playTestSmtpConversation(mock_hmail, mock_socket, reject, [
                { from: 'remote', line: '220 testing-smtp' },
                { from: 'haraka', test: (l) => l.match(/^EHLO /), description: 'EHLO' },
                { from: 'remote', line: '220-testing-smtp' },
                { from: 'remote', line: '220 8BITMIME' },
                { from: 'haraka', test: 'MAIL FROM:<sender@domain>' },
                { from: 'remote', line: '250 2.1.0 Ok' },
                { from: 'haraka', test: 'RCPT TO:<recipient@domain>' },
                { from: 'remote', line: '400 4.0.0 Currently not available. Try again later.' },
                { from: 'haraka', test: 'QUIT', end_test: true },
            ], () => {})
        })
    })

    it('DATA 4XX triggers temp_fail with status 4.6.0', async () => {
        const mock_hmail = await mockHMailItem(outbound_context)
        const mock_socket = mock_sock.connect('testhost', 'testport')
        mock_socket.writable = true

        await new Promise((resolve, reject) => {
            const orig = HMailItem.prototype.temp_fail
            HMailItem.prototype.temp_fail = function (err, opts) {
                try {
                    assert.equal(this.todo.rcpt_to[0].dsn_status, '4.6.0')
                    assert.equal(this.todo.rcpt_to[0].dsn_action, 'delayed')
                    assert.match(this.todo.rcpt_to[0].dsn_smtp_response, /Currently I do not like ascii art cats\./)
                    resolve()
                } catch (e) {
                    reject(e)
                } finally {
                    HMailItem.prototype.temp_fail = orig
                }
            }
            util_hmailitem.playTestSmtpConversation(mock_hmail, mock_socket, reject, [
                { from: 'remote', line: '220 testing-smtp' },
                { from: 'haraka', test: (l) => l.match(/^EHLO /), description: 'EHLO' },
                { from: 'remote', line: '220-testing-smtp' },
                { from: 'remote', line: '220 8BITMIME' },
                { from: 'haraka', test: 'MAIL FROM:<sender@domain>' },
                { from: 'remote', line: '250 2.1.0 Ok' },
                { from: 'haraka', test: 'RCPT TO:<recipient@domain>' },
                { from: 'remote', line: '250 2.1.5 Ok' },
                { from: 'haraka', test: 'DATA' },
                { from: 'remote', line: '450 4.6.0 Currently I do not like ascii art cats.' },
                { from: 'haraka', test: 'QUIT', end_test: true },
            ], () => {})
        })
    })

    it('RCPT-TO 5XX triggers RFC3464 bounce with status 5.1.1', async () => {
        const mock_hmail = await mockHMailItem(outbound_context)
        const mock_socket = mock_sock.connect('testhost', 'testport')
        mock_socket.writable = true

        await new Promise((resolve, reject) => {
            const orig = outbound_context.exports.send_email
            outbound_context.exports.send_email = (from, to, contents, cb, opts) => {
                try {
                    assert.match(contents, /^Content-type: message\/delivery-status/m)
                    assert.match(contents, /^Final-Recipient: rfc822;recipient@domain/m)
                    assert.match(contents, /^Action: failed/m)
                    assert.match(contents, /^Status: 5\.1\.1/m)
                    assert.match(contents, /Not available and will not come back/)
                    resolve()
                } catch (e) {
                    reject(e)
                } finally {
                    outbound_context.exports.send_email = orig
                }
            }
            util_hmailitem.playTestSmtpConversation(mock_hmail, mock_socket, reject, [
                { from: 'remote', line: '220 testing-smtp' },
                { from: 'haraka', test: (l) => l.match(/^EHLO /), description: 'EHLO' },
                { from: 'remote', line: '220-testing-smtp' },
                { from: 'remote', line: '220 8BITMIME' },
                { from: 'haraka', test: 'MAIL FROM:<sender@domain>' },
                { from: 'remote', line: '250 2.1.0 Ok' },
                { from: 'haraka', test: 'RCPT TO:<recipient@domain>' },
                { from: 'remote', line: '550 5.1.1 Not available and will not come back' },
                { from: 'haraka', test: 'QUIT', end_test: true },
            ], () => {})
        })
    })

    it('DATA 5XX triggers RFC3464 bounce with status 5.6.0', async () => {
        const mock_hmail = await mockHMailItem(outbound_context)
        const mock_socket = mock_sock.connect('testhost', 'testport')
        mock_socket.writable = true

        await new Promise((resolve, reject) => {
            const orig = outbound_context.exports.send_email
            outbound_context.exports.send_email = (from, to, contents, cb, opts) => {
                try {
                    assert.match(contents, /^Content-type: message\/delivery-status/m)
                    assert.match(contents, /^Final-Recipient: rfc822;recipient@domain/m)
                    assert.match(contents, /^Action: failed/m)
                    assert.match(contents, /^Status: 5\.6\.0/m)
                    assert.match(contents, /I never did and will like ascii art cats/)
                    resolve()
                } catch (e) {
                    reject(e)
                } finally {
                    outbound_context.exports.send_email = orig
                }
            }
            util_hmailitem.playTestSmtpConversation(mock_hmail, mock_socket, reject, [
                { from: 'remote', line: '220 testing-smtp' },
                { from: 'haraka', test: (l) => l.match(/^EHLO /), description: 'EHLO' },
                { from: 'remote', line: '220-testing-smtp' },
                { from: 'remote', line: '220 8BITMIME' },
                { from: 'haraka', test: 'MAIL FROM:<sender@domain>' },
                { from: 'remote', line: '250 2.1.0 Ok' },
                { from: 'haraka', test: 'RCPT TO:<recipient@domain>' },
                { from: 'remote', line: '250 2.1.5 Ok' },
                { from: 'haraka', test: 'DATA' },
                { from: 'remote', line: '550 5.6.0 I never did and will like ascii art cats.' },
                { from: 'haraka', test: 'QUIT', end_test: true },
            ], () => {})
        })
    })
})
