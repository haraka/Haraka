'use strict'

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

const bounceFor = async (header_lines) => {
    const hmail = await mockHMailItem()
    const header = new Header()
    header.parse(header_lines)
    return new Promise((resolve, reject) => {
        hmail.populate_bounce_message_with_headers(
            new Address('<>'),
            new Address('sender@example.com'),
            'test reason',
            header,
            (err, lines) => (err ? reject(err) : resolve(lines.join(''))),
        )
    })
}

const partHeaders = (bounce, type) => {
    const match = bounce.match(new RegExp(`^Content-Type: ${type};[^]*?\\r\\n\\r\\n`, 'm'))
    assert.ok(match, `${type} part present`)
    return match[0]
}

describe('bounce message charset', () => {
    beforeEach(ensureQueueDir)
    afterEach(cleanQueueDir)

    const encodedSubject = `Subject: =?UTF-8?B?${Buffer.from('Ergänzend').toString('base64')}?=\r\n`

    it('keeps a decoded non-ASCII subject intact', async () => {
        const bounce = await bounceFor([encodedSubject])
        assert.match(bounce, /"Ergänzend"/)
    })

    it('labels the text part as 8bit UTF-8', async () => {
        const headers = partHeaders(await bounceFor([encodedSubject]), 'text/plain')
        assert.match(headers, /charset=UTF-8/)
        assert.match(headers, /^Content-Transfer-Encoding: 8bit\r$/m)
    })

    it('labels the HTML part as 8bit UTF-8', async () => {
        const headers = partHeaders(await bounceFor([encodedSubject]), 'text/html')
        assert.match(headers, /charset=UTF-8/)
        assert.match(headers, /^Content-Transfer-Encoding: 8bit\r$/m)
    })

    it('declares MIME-Version once in the top-level headers', async () => {
        const bounce = await bounceFor([encodedSubject])
        const topHeaders = bounce.split('\r\n\r\n')[0]
        assert.equal(topHeaders.match(/^MIME-Version: 1\.0\r?$/gim)?.length, 1)
    })
})
