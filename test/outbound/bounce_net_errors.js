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

const ensureQueueDir = () => fs.promises.mkdir(queue_dir, { recursive: true })

const cleanQueueDir = async () => {
    if (!fs.existsSync(queue_dir)) return
    for (const file of fs.readdirSync(queue_dir)) {
        const full = path.resolve(queue_dir, file)
        if (fs.lstatSync(full).isDirectory()) throw new Error(`unexpected subdirectory: ${full}`)
        fs.unlinkSync(full)
    }
}

/** Creates a mock HMailItem, resolving with it or rejecting on error. */
const mockHMailItem = (ctx, opts = {}) =>
    new Promise((resolve, reject) => {
        util_hmailitem.newMockHMailItem(ctx, reject, opts, resolve)
    })

/**
 * Intercepts `HMailItem.prototype[method]`, calls `assertion(this)` when invoked,
 * then triggers the action under test via `trigger()`.
 */
const interceptAndAssert = (method, assertion, trigger) =>
    new Promise((resolve, reject) => {
        const orig = HMailItem.prototype[method]
        HMailItem.prototype[method] = function () {
            try {
                assertion(this)
                resolve()
            } catch (e) {
                reject(e)
            } finally {
                HMailItem.prototype[method] = orig
            }
        }
        trigger()
    })

// ── Tests ─────────────────────────────────────────────────────────────────────

// [method, dsn_status, optional setup fn, trigger fn, test name]
const testCases = [
    {
        name: 'get_mx=DENY triggers bounce with dsn_status 5.1.2',
        method: 'bounce',
        status: '5.1.2',
        setup: (h) => {
            h.domain = h.todo.domain
        },
        trigger: (h) => HMailItem.prototype.get_mx_respond.apply(h, [constants.deny, {}]),
    },
    {
        name: 'get_mx=DENYSOFT triggers temp_fail with dsn_status 4.1.2',
        method: 'temp_fail',
        status: '4.1.2',
        setup: (h) => {
            h.domain = h.todo.domain
        },
        trigger: (h) => HMailItem.prototype.get_mx_respond.apply(h, [constants.denysoft, {}]),
    },
    {
        name: 'get_mx_error({code:NXDOMAIN}) triggers bounce with dsn_status 5.1.2',
        method: 'bounce',
        status: '5.1.2',
        trigger: (h) => HMailItem.prototype.get_mx_error.apply(h, [{ code: dns.NXDOMAIN }]),
    },
    {
        name: "get_mx_error({code:'SOME-OTHER-ERR'}) triggers temp_fail with dsn_status 4.1.0",
        method: 'temp_fail',
        status: '4.1.0',
        trigger: (h) => HMailItem.prototype.get_mx_error.apply(h, [{ code: 'SOME-OTHER-ERR' }, {}]),
    },
    {
        name: 'found_mx with empty exchange triggers bounce with dsn_status 5.1.2',
        method: 'bounce',
        status: '5.1.2',
        trigger: (h) => HMailItem.prototype.found_mx.apply(h, [[{ priority: 0, exchange: '' }]]),
    },
    {
        name: 'try_deliver with empty mxlist triggers temp_fail with dsn_status 5.1.2',
        method: 'temp_fail',
        status: '5.1.2',
        setup: (h) => {
            h.mxlist = []
        },
        trigger: (h) => HMailItem.prototype.try_deliver.apply(h, []),
    },
]

describe('outbound_bounce_net_errors', () => {
    beforeEach(ensureQueueDir)
    afterEach(cleanQueueDir)

    for (const { name, method, status, setup, trigger } of testCases) {
        it(name, async () => {
            const mock_hmail = await mockHMailItem(outbound_context)
            if (setup) setup(mock_hmail)
            await interceptAndAssert(
                method,
                (h) => assert.equal(h.todo.rcpt_to[0].dsn_status, status, 'dsn_status'),
                () => trigger(mock_hmail),
            )
        })
    }
})
