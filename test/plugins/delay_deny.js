'use strict'

const assert = require('node:assert/strict')
const { describe, it, beforeEach } = require('node:test')

const fixtures = require('haraka-test-fixtures')
require('haraka-constants').import(global)

// params layout: [code, msg, pi_name, pi_function, pi_params, pi_hook]
function makeParams({ code = DENY, msg = 'test deny', name = 'some_plugin', fn = 'hook_fn', hook = 'ehlo' } = {}) {
    return [code, msg, name, fn, null, hook]
}

describe('delay_deny', () => {
    let plugin, conn

    beforeEach(() => {
        plugin = new fixtures.plugin('delay_deny')
        plugin.config.get = () => ({ main: {} })
        conn = fixtures.connection.createConnection()
        conn.init_transaction()
    })

    describe('hook_deny', () => {
        it('skips itself (pi_name === delay_deny)', (t, done) => {
            plugin.hook_deny(
                (rc) => {
                    assert.equal(rc, undefined)
                    done()
                },
                conn,
                makeParams({ name: 'delay_deny' }),
            )
        })

        it('stores connection-level pre-DATA deny for ehlo hook', (t, done) => {
            const params = makeParams({ hook: 'ehlo' })
            plugin.hook_deny(
                (rc) => {
                    assert.equal(rc, OK)
                    assert.equal(conn.notes.delay_deny_pre.length, 1)
                    assert.equal(conn.notes.delay_deny_pre[0], params)
                    assert.equal(conn.notes.delay_deny_pre_fail['some_plugin'], 1)
                    done()
                },
                conn,
                params,
            )
        })

        it('stores connection-level pre-DATA deny for connect hook', (t, done) => {
            const params = makeParams({ hook: 'connect' })
            plugin.hook_deny(
                (rc) => {
                    assert.equal(rc, OK)
                    assert.ok(conn.notes.delay_deny_pre.includes(params))
                    done()
                },
                conn,
                params,
            )
        })

        it('stores transaction-level pre-DATA deny for mail hook', (t, done) => {
            const params = makeParams({ hook: 'mail' })
            plugin.hook_deny(
                (rc) => {
                    assert.equal(rc, OK)
                    assert.equal(conn.transaction.notes.delay_deny_pre.length, 1)
                    assert.equal(conn.transaction.notes.delay_deny_pre[0], params)
                    assert.equal(conn.transaction.notes.delay_deny_pre_fail['some_plugin'], 1)
                    done()
                },
                conn,
                params,
            )
        })

        it('stores transaction-level pre-DATA deny for rcpt hook', (t, done) => {
            const params = makeParams({ hook: 'rcpt' })
            plugin.hook_deny(
                (rc) => {
                    assert.equal(rc, OK)
                    assert.equal(conn.transaction.notes.delay_deny_pre.length, 1)
                    assert.equal(conn.transaction.notes.delay_deny_pre[0], params)
                    done()
                },
                conn,
                params,
            )
        })

        it('calls next (no delay) for data_post hook', (t, done) => {
            plugin.hook_deny(
                (rc) => {
                    assert.equal(rc, undefined)
                    done()
                },
                conn,
                makeParams({ hook: 'data_post' }),
            )
        })

        it('calls next (no delay) for data hook', (t, done) => {
            plugin.hook_deny(
                (rc) => {
                    assert.equal(rc, undefined)
                    done()
                },
                conn,
                makeParams({ hook: 'data' }),
            )
        })

        it('delays when plugin is in included_plugins list', (t, done) => {
            plugin.config.get = () => ({ main: { included_plugins: 'allowed_plugin' } })
            const params = makeParams({ name: 'allowed_plugin', hook: 'ehlo' })
            plugin.hook_deny(
                (rc) => {
                    assert.equal(rc, OK)
                    done()
                },
                conn,
                params,
            )
        })

        it('passes through when plugin is not in included_plugins list', (t, done) => {
            plugin.config.get = () => ({ main: { included_plugins: 'allowed_plugin' } })
            plugin.hook_deny(
                (rc) => {
                    assert.equal(rc, undefined)
                    done()
                },
                conn,
                makeParams({ name: 'other_plugin', hook: 'ehlo' }),
            )
        })

        it('passes through when plugin is in excluded_plugins list', (t, done) => {
            plugin.config.get = () => ({ main: { excluded_plugins: 'skip_plugin' } })
            plugin.hook_deny(
                (rc) => {
                    assert.equal(rc, undefined)
                    done()
                },
                conn,
                makeParams({ name: 'skip_plugin', hook: 'ehlo' }),
            )
        })

        it('delays when plugin is not in excluded_plugins list', (t, done) => {
            plugin.config.get = () => ({ main: { excluded_plugins: 'skip_plugin' } })
            const params = makeParams({ name: 'other_plugin', hook: 'ehlo' })
            plugin.hook_deny(
                (rc) => {
                    assert.equal(rc, OK)
                    done()
                },
                conn,
                params,
            )
        })

        it('can exclude by plugin:hook format', (t, done) => {
            plugin.config.get = () => ({ main: { excluded_plugins: 'some_plugin:helo' } })
            plugin.hook_deny(
                (rc) => {
                    assert.equal(rc, undefined)
                    done()
                },
                conn,
                makeParams({ name: 'some_plugin', hook: 'helo' }),
            )
        })

        it('can exclude by plugin:hook:function format', (t, done) => {
            plugin.config.get = () => ({ main: { excluded_plugins: 'some_plugin:ehlo:hook_fn' } })
            plugin.hook_deny(
                (rc) => {
                    assert.equal(rc, undefined)
                    done()
                },
                conn,
                makeParams({ name: 'some_plugin', fn: 'hook_fn', hook: 'ehlo' }),
            )
        })
    })

    describe('hook_rcpt_ok', () => {
        it('calls next when there is no transaction', (t, done) => {
            conn.transaction = null
            plugin.hook_rcpt_ok((rc) => {
                assert.equal(rc, undefined)
                done()
            }, conn)
        })

        it('bypasses all denies when connection is relaying', (t, done) => {
            conn.relaying = true
            conn.notes.delay_deny_pre = [makeParams({ hook: 'ehlo' })]
            plugin.hook_rcpt_ok((rc) => {
                assert.equal(rc, undefined)
                done()
            }, conn)
        })

        it('applies deferred connection-level deny', (t, done) => {
            conn.relaying = false
            conn.notes.delay_deny_pre = [[DENY, 'deferred ehlo deny', 'check_relay', 'fn', null, 'ehlo']]
            plugin.hook_rcpt_ok((rc, msg) => {
                assert.equal(rc, DENY)
                assert.equal(msg, 'deferred ehlo deny')
                done()
            }, conn)
        })

        it('applies deferred transaction-level deny', (t, done) => {
            conn.relaying = false
            conn.transaction.notes.delay_deny_pre = [[DENYSOFT, 'deferred mail deny', 'check_helo', 'fn', null, 'mail']]
            plugin.hook_rcpt_ok((rc, msg) => {
                assert.equal(rc, DENYSOFT)
                assert.equal(msg, 'deferred mail deny')
                done()
            }, conn)
        })

        it('calls next when no deferred denies are present', (t, done) => {
            conn.relaying = false
            plugin.hook_rcpt_ok((rc) => {
                assert.equal(rc, undefined)
                done()
            }, conn)
        })
    })

    describe('hook_data', () => {
        it('calls next when no pre-DATA failures exist', (t, done) => {
            plugin.hook_data((rc) => {
                assert.equal(rc, undefined)
                done()
            }, conn)
        })

        it('calls next when transaction is missing', (t, done) => {
            conn.transaction = null
            plugin.hook_data((rc) => {
                assert.equal(rc, undefined)
                done()
            }, conn)
        })

        it('calls next with no action when transaction has pre-DATA failures', (t, done) => {
            // Note: fails.push.apply(Object.keys(...)) in the plugin is a pre-existing bug —
            // the array receives no items so the header is never added.
            conn.transaction.notes.delay_deny_pre_fail = { bad_plugin: 1, another_plugin: 1 }
            plugin.hook_data((rc) => {
                assert.equal(rc, undefined)
                done()
            }, conn)
        })
    })
})
