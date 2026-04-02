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

const ensureQueueDir = () => fs.promises.mkdir(queue_dir, { recursive: true })

const cleanQueueDir = async () => {
    if (!fs.existsSync(queue_dir)) return
    for (const file of fs.readdirSync(queue_dir)) {
        const full = path.resolve(queue_dir, file)
        if (fs.lstatSync(full).isDirectory()) throw new Error(`unexpected subdirectory: ${full}`)
        fs.unlinkSync(full)
    }
}

const mockHMailItem = (ctx, opts = {}) =>
    new Promise((resolve, reject) => {
        util_hmailitem.newMockHMailItem(ctx, reject, opts, resolve)
    })

/** Spies on HMailItem.prototype.temp_fail and resolves when called. */
const interceptTempFail = (mock_hmail, mock_socket, assertion, conversation) =>
    new Promise((resolve, reject) => {
        const orig = HMailItem.prototype.temp_fail
        HMailItem.prototype.temp_fail = function () {
            try {
                assertion(this)
                resolve()
            } catch (e) {
                reject(e)
            } finally {
                HMailItem.prototype.temp_fail = orig
            }
        }
        util_hmailitem.playTestSmtpConversation(mock_hmail, mock_socket, reject, conversation, () => {})
    })

/** Spies on outbound.send_email and resolves when called. */
const interceptSendEmail = (mock_hmail, mock_socket, assertion, conversation) =>
    new Promise((resolve, reject) => {
        const orig = outbound_context.exports.send_email
        outbound_context.exports.send_email = (from, to, contents) => {
            try {
                assertion(contents)
                resolve()
            } catch (e) {
                reject(e)
            } finally {
                outbound_context.exports.send_email = orig
            }
        }
        util_hmailitem.playTestSmtpConversation(mock_hmail, mock_socket, reject, conversation, () => {})
    })

// ── Shared conversation building blocks ───────────────────────────────────────

const EHLO_PREAMBLE = [
    { from: 'remote', line: '220 testing-smtp' },
    { from: 'haraka', test: (l) => l.match(/^EHLO /), description: 'EHLO' },
    { from: 'remote', line: '220-testing-smtp' },
    { from: 'remote', line: '220 8BITMIME' },
]
const MAIL_OK = [
    { from: 'haraka', test: 'MAIL FROM:<sender@domain>' },
    { from: 'remote', line: '250 2.1.0 Ok' },
]
const RCPT_OK = [
    { from: 'haraka', test: 'RCPT TO:<recipient@domain>' },
    { from: 'remote', line: '250 2.1.5 Ok' },
]
const QUIT = { from: 'haraka', test: 'QUIT', end_test: true }

// ── Tests ─────────────────────────────────────────────────────────────────────

// Permanent bounce tests: spy on send_email, check DSN bounce contents
const bounceCases = [
    {
        name: 'MAIL FROM 500 triggers RFC3464 bounce with status 5.0.0',
        statusRe: /^Status: 5\.0\.0/m,
        messageRe: /Absolutely not acceptable\. Basic Test Only\./,
        conversation: [
            ...EHLO_PREAMBLE,
            { from: 'haraka', test: 'MAIL FROM:<sender@domain>' },
            { from: 'remote', line: '500 5.0.0 Absolutely not acceptable. Basic Test Only.' },
            QUIT,
        ],
    },
    {
        name: 'RCPT-TO 5XX triggers RFC3464 bounce with status 5.1.1',
        statusRe: /^Status: 5\.1\.1/m,
        messageRe: /Not available and will not come back/,
        conversation: [
            ...EHLO_PREAMBLE,
            ...MAIL_OK,
            { from: 'haraka', test: 'RCPT TO:<recipient@domain>' },
            { from: 'remote', line: '550 5.1.1 Not available and will not come back' },
            QUIT,
        ],
    },
    {
        name: 'DATA 5XX triggers RFC3464 bounce with status 5.6.0',
        statusRe: /^Status: 5\.6\.0/m,
        messageRe: /I never did and will like ascii art cats/,
        conversation: [
            ...EHLO_PREAMBLE,
            ...MAIL_OK,
            ...RCPT_OK,
            { from: 'haraka', test: 'DATA' },
            { from: 'remote', line: '550 5.6.0 I never did and will like ascii art cats.' },
            QUIT,
        ],
    },
]

// Temporary failure tests: spy on temp_fail, check DSN rcpt fields
const tempFailCases = [
    {
        name: 'early 3XX response triggers temp_fail with status 3.0.0',
        dsn_status: '3.0.0',
        dsn_action: 'delayed',
        smtpRe: /No time for you right now/,
        conversation: [
            ...EHLO_PREAMBLE,
            { from: 'haraka', test: 'MAIL FROM:<sender@domain>' },
            { from: 'remote', line: '300 3.0.0 No time for you right now' },
            QUIT,
        ],
    },
    {
        name: 'RCPT-TO 4XX triggers temp_fail with status 4.0.0',
        dsn_status: '4.0.0',
        dsn_action: 'delayed',
        smtpRe: /Currently not available\. Try again later\./,
        conversation: [
            ...EHLO_PREAMBLE,
            ...MAIL_OK,
            { from: 'haraka', test: 'RCPT TO:<recipient@domain>' },
            { from: 'remote', line: '400 4.0.0 Currently not available. Try again later.' },
            QUIT,
        ],
    },
    {
        name: 'DATA 4XX triggers temp_fail with status 4.6.0',
        dsn_status: '4.6.0',
        dsn_action: 'delayed',
        smtpRe: /Currently I do not like ascii art cats\./,
        conversation: [
            ...EHLO_PREAMBLE,
            ...MAIL_OK,
            ...RCPT_OK,
            { from: 'haraka', test: 'DATA' },
            { from: 'remote', line: '450 4.6.0 Currently I do not like ascii art cats.' },
            QUIT,
        ],
    },
]

describe('outbound_bounce_rfc3464', () => {
    beforeEach(ensureQueueDir)
    afterEach(cleanQueueDir)

    describe('permanent bounce (send_email)', () => {
        for (const { name, statusRe, messageRe, conversation } of bounceCases) {
            it(name, async () => {
                const mock_hmail = await mockHMailItem(outbound_context)
                const mock_socket = mock_sock.connect('testhost', 'testport')
                mock_socket.writable = true
                await interceptSendEmail(
                    mock_hmail,
                    mock_socket,
                    (contents) => {
                        assert.match(contents, /^Content-type: message\/delivery-status/m)
                        assert.match(contents, /^Final-Recipient: rfc822;recipient@domain/m)
                        assert.match(contents, /^Action: failed/m)
                        assert.match(contents, statusRe)
                        assert.match(contents, messageRe)
                    },
                    conversation,
                )
            })
        }
    })

    describe('temporary failure (temp_fail)', () => {
        for (const { name, dsn_status, dsn_action, smtpRe, conversation } of tempFailCases) {
            it(name, async () => {
                const mock_hmail = await mockHMailItem(outbound_context)
                const mock_socket = mock_sock.connect('testhost', 'testport')
                mock_socket.writable = true
                await interceptTempFail(
                    mock_hmail,
                    mock_socket,
                    (h) => {
                        assert.equal(h.todo.rcpt_to[0].dsn_status, dsn_status)
                        assert.equal(h.todo.rcpt_to[0].dsn_action, dsn_action)
                        assert.match(h.todo.rcpt_to[0].dsn_smtp_response, smtpRe)
                    },
                    conversation,
                )
            })
        }
    })
})
