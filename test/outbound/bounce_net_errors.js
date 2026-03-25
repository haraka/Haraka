'use strict'

// Testing bounce email contents related to errors occurring during SMTP dialog.
// Strategy: create an HMailItem via fixtures, invoke an outbound method, then
// verify that the correct bounce/temp_fail handler is called.

const { describe, it, beforeEach, afterEach } = require('node:test')
const assert = require('node:assert')
const dns = require('node:dns')
const fs = require('node:fs')
const path = require('node:path')

const constants = require('haraka-constants')

// Load outbound/index FIRST to avoid the circular-dependency boot-order issue:
// hmail.js → require('./index') while index.js is still loading causes queue.js
// to capture a stale (empty) module.exports for hmail.js.
const outbound = require('../../outbound')
const HMailItem = outbound.HMailItem
const TODOItem = require('../../outbound/todo')

const util_hmailitem = require('../fixtures/util_hmailitem')

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

/** Creates a mock HMailItem, resolving with it or rejecting on error. */
const mockHMailItem = (ctx, opts = {}) =>
    new Promise((resolve, reject) => {
        util_hmailitem.newMockHMailItem(ctx, reject, opts, resolve)
    })

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('outbound_bounce_net_errors', () => {
    beforeEach(ensureQueueDir)
    afterEach(cleanQueueDir)

    it('get_mx=DENY triggers bounce with dsn_status 5.1.2', async () => {
        const mock_hmail = await mockHMailItem(outbound_context)
        await new Promise((resolve, reject) => {
            const orig = HMailItem.prototype.bounce
            HMailItem.prototype.bounce = function (err, opts) {
                try {
                    assert.equal(this.todo.rcpt_to[0].dsn_status, '5.1.2', 'dsn status')
                    resolve()
                } catch (e) {
                    reject(e)
                } finally {
                    HMailItem.prototype.bounce = orig
                }
            }
            mock_hmail.domain = mock_hmail.todo.domain
            HMailItem.prototype.get_mx_respond.apply(mock_hmail, [constants.deny, {}])
        })
    })

    it('get_mx=DENYSOFT triggers temp_fail with dsn_status 4.1.2', async () => {
        const mock_hmail = await mockHMailItem(outbound_context)
        await new Promise((resolve, reject) => {
            const orig = HMailItem.prototype.temp_fail
            HMailItem.prototype.temp_fail = function (err, opts) {
                try {
                    assert.equal(this.todo.rcpt_to[0].dsn_status, '4.1.2', 'dsn status')
                    resolve()
                } catch (e) {
                    reject(e)
                } finally {
                    HMailItem.prototype.temp_fail = orig
                }
            }
            mock_hmail.domain = mock_hmail.todo.domain
            HMailItem.prototype.get_mx_respond.apply(mock_hmail, [constants.denysoft, {}])
        })
    })

    it('get_mx_error({code:NXDOMAIN}) triggers bounce with dsn_status 5.1.2', async () => {
        const mock_hmail = await mockHMailItem(outbound_context)
        await new Promise((resolve, reject) => {
            const orig = HMailItem.prototype.bounce
            HMailItem.prototype.bounce = function (err, opts) {
                try {
                    assert.equal(this.todo.rcpt_to[0].dsn_status, '5.1.2', 'dsn status')
                    resolve()
                } catch (e) {
                    reject(e)
                } finally {
                    HMailItem.prototype.bounce = orig
                }
            }
            HMailItem.prototype.get_mx_error.apply(mock_hmail, [{ code: dns.NXDOMAIN }])
        })
    })

    it("get_mx_error({code:'SOME-OTHER-ERR'}) triggers temp_fail with dsn_status 4.1.0", async () => {
        const mock_hmail = await mockHMailItem(outbound_context)
        await new Promise((resolve, reject) => {
            const orig = HMailItem.prototype.temp_fail
            HMailItem.prototype.temp_fail = function (err, opts) {
                try {
                    assert.equal(this.todo.rcpt_to[0].dsn_status, '4.1.0', 'dsn status')
                    resolve()
                } catch (e) {
                    reject(e)
                } finally {
                    HMailItem.prototype.temp_fail = orig
                }
            }
            HMailItem.prototype.get_mx_error.apply(mock_hmail, [{ code: 'SOME-OTHER-ERR' }, {}])
        })
    })

    it("found_mx(null, [{priority:0,exchange:''}]) triggers bounce with dsn_status 5.1.2", async () => {
        const mock_hmail = await mockHMailItem(outbound_context)
        await new Promise((resolve, reject) => {
            const orig = HMailItem.prototype.bounce
            HMailItem.prototype.bounce = function (err, opts) {
                try {
                    assert.equal(this.todo.rcpt_to[0].dsn_status, '5.1.2', 'dsn status')
                    resolve()
                } catch (e) {
                    reject(e)
                } finally {
                    HMailItem.prototype.bounce = orig
                }
            }
            HMailItem.prototype.found_mx.apply(mock_hmail, [[{ priority: 0, exchange: '' }]])
        })
    })

    it('try_deliver with empty mxlist triggers temp_fail with dsn_status 5.1.2', async () => {
        const mock_hmail = await mockHMailItem(outbound_context)
        mock_hmail.mxlist = []
        await new Promise((resolve, reject) => {
            const orig = HMailItem.prototype.temp_fail
            HMailItem.prototype.temp_fail = function (err, opts) {
                try {
                    assert.equal(this.todo.rcpt_to[0].dsn_status, '5.1.2', 'dsn status')
                    resolve()
                } catch (e) {
                    reject(e)
                } finally {
                    HMailItem.prototype.temp_fail = orig
                }
            }
            HMailItem.prototype.try_deliver.apply(mock_hmail, [])
        })
    })
})
