'use strict'

// A remote sender must not be able to inject headers or body content into the
// bounce message Haraka generates from their message.

const { describe, it, beforeEach, afterEach } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const { Address } = require('@haraka/email-address')
const { Header } = require('haraka-email-message')

// Load outbound/index FIRST to avoid the circular-dependency boot-order issue.
const outbound = require('../../outbound')
const TODOItem = require('../../outbound/todo')
const obc = require('../../outbound/config')

const util_hmailitem = require('../fixtures/util_hmailitem')

obc.cfg.pool_concurrency_max = 0

const outbound_context = { TODOItem, exports: outbound }

// gitignored, so it does not exist on a clean checkout
const queue_dir = path.resolve(__dirname, '../test-queue')

const ensureQueueDir = () => fs.promises.mkdir(queue_dir, { recursive: true })

const cleanQueueDir = async () => {
    if (!fs.existsSync(queue_dir)) return
    for (const file of fs.readdirSync(queue_dir)) {
        const full = path.resolve(queue_dir, file)
        if (fs.lstatSync(full).isDirectory()) throw new Error(`unexpected subdirectory: ${full}`)
        fs.unlinkSync(full)
    }
}

const mockHMailItem = () =>
    new Promise((resolve, reject) => {
        util_hmailitem.newMockHMailItem(outbound_context, reject, {}, resolve)
    })

const bounceFor = async (header_lines, reason = 'test reason') => {
    const hmail = await mockHMailItem()
    const header = new Header()
    header.parse(header_lines)
    return new Promise((resolve, reject) => {
        hmail.populate_bounce_message_with_headers(
            new Address('<>'),
            new Address('victim@example.com'),
            reason,
            header,
            (err, lines) => (err ? reject(err) : resolve(lines.join(''))),
        )
    })
}

const headerBlockOf = (bounce) => bounce.split('\r\n\r\n')[0]

describe('bounce message injection', () => {
    beforeEach(ensureQueueDir)
    afterEach(cleanQueueDir)

    it('folds repeated Message-Id fields into one References header', async () => {
        const bounce = await bounceFor([
            'Message-Id: <a@example.com>\r\n',
            'Message-Id: X-Injected: yes\r\n',
            'Subject: hi\r\n',
        ])
        const references = bounce.match(/^References: .*$/m)[0]
        assert.match(references, /<a@example\.com>/)
        assert.ok(!/^X-Injected:/m.test(headerBlockOf(bounce)), 'no injected header')
    })

    it('keeps Original-Envelope-Id on a single line', async () => {
        const bounce = await bounceFor([
            'Message-Id: <a@example.com>\r\n',
            'Message-Id: X-Injected: yes\r\n',
            'Subject: hi\r\n',
        ])
        assert.match(bounce, /^Original-Envelope-Id: .*<a@example\.com>/m)
        assert.ok(!/^X-Injected: yes\r?$/m.test(bounce), 'attacker text never starts a line')
    })

    it('cannot inject via repeated Subject fields', async () => {
        const bounce = await bounceFor(['Subject: one\r\n', 'Subject: X-Injected: yes\r\n'])
        assert.ok(!/^X-Injected:/m.test(bounce), 'no injected header')
    })

    it('cannot inject via an RFC 2047 encoded word that decodes to CRLF', async () => {
        const payload = Buffer.from('evil\r\nX-Injected: yes').toString('base64')
        const bounce = await bounceFor([`Subject: =?utf-8?B?${payload}?=\r\n`])
        assert.ok(!/^X-Injected:/m.test(bounce), 'no injected header')
    })

    it('cannot inject via a multiline failure reason', async () => {
        const bounce = await bounceFor(['Subject: hi\r\n'], 'rejected\r\nX-Injected: yes')
        assert.ok(!/^X-Injected:/m.test(bounce), 'no injected header')
    })
})
