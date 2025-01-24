'use strict';
const assert = require('node:assert')
const sinon = require('sinon')

const fixtures  = require('haraka-test-fixtures');
const Address   = require('address-rfc2821').Address
const net_utils = require('haraka-net-utils');

const _set_up = (done) => {

    this.plugin = new fixtures.plugin('mail_from.is_resolvable');
    this.plugin.register();

    this.connection = fixtures.connection.createConnection();
    this.connection.init_transaction()

    done();
}

describe('mail_from.is_resolvable', () => {
  beforeEach((done) => {
    _set_up(() => {

    this.get_mx_Spy = sinon.stub(net_utils, 'get_mx')
    this.resolve_mx_hosts_Spy = sinon.stub(net_utils, 'resolve_mx_hosts')

      done()
    })
  })

  afterEach(() => {
    sinon.restore()
  })

    describe('hook_mail', () => {

        it('Allow - mail_from without host', async () => {
            await this.plugin.hook_mail((code, msg) => {
                sinon.assert.notCalled(this.get_mx_Spy)
                sinon.assert.notCalled(this.resolve_mx_hosts_Spy)

                assert.equal(
                  this.connection.transaction.results.get(this.plugin).skip,
                  'null host',
                )
                assert.strictEqual(code, undefined)
                assert.strictEqual(msg, undefined)
            },
            this.connection, 
            [{}]
            )
        })

        it('DENY - No MX for your FROM address', async () => {
            this.get_mx_Spy.resolves([])
            await this.plugin.hook_mail((code, msg) => {
                sinon.assert.calledOnce(this.get_mx_Spy)
                sinon.assert.notCalled(this.resolve_mx_hosts_Spy)
                assert.ok(
                    this.connection.transaction.results.has(
                          this.plugin,
                          'fail',
                          'has_fwd_dns',
                    )
                )
                assert.strictEqual(code, DENY)
                assert.strictEqual(msg, 'No MX for your FROM address')
            },
            this.connection, 
            [new Address('<jeff@example.com>')]
            )
        })

        it('DENYSOFT - No valid MX for your FROM address', async () => {
            this.plugin.cfg.reject.no_mx = false
            this.get_mx_Spy.resolves([{"exchange":"64.233.186.26"}])

            await this.plugin.hook_mail((code, msg) => {
                sinon.assert.calledOnce(this.get_mx_Spy)
                sinon.assert.notCalled(this.resolve_mx_hosts_Spy)
                assert.ok(
                    !this.connection.transaction.results.has(
                          this.plugin,
                          'fail',
                          'has_fwd_dns',
                    )
                )
                assert.strictEqual(code, DENYSOFT)
                assert.strictEqual(msg, 'No valid MX for your FROM address')
            },
            this.connection, 
            [new Address('<jeff@topview.video>')]
            )
        })

        it('DENY - No valid MX for your FROM address', async () => {
            this.get_mx_Spy.resolves([{"exchange":"64.233.186.26"}])

            await this.plugin.hook_mail((code, msg) => {
                sinon.assert.calledOnce(this.get_mx_Spy)
                sinon.assert.notCalled(this.resolve_mx_hosts_Spy)
                assert.ok(
                    !this.connection.transaction.results.has(
                          this.plugin,
                          'fail',
                          'has_fwd_dns',
                    )
                )
                assert.strictEqual(code, DENY)
                assert.strictEqual(msg, 'No valid MX for your FROM address')
            },
            this.connection, 
            [new Address('<jeff@topview.video>')]
            )
        })

        it('Allow - No MX for your FROM address', async () => {
            this.plugin.cfg.reject.no_mx = false
            this.get_mx_Spy.resolves([])

            await this.plugin.hook_mail((code, msg) => {
                sinon.assert.calledOnce(this.get_mx_Spy)
                sinon.assert.notCalled(this.resolve_mx_hosts_Spy)
                assert.ok(
                    this.connection.transaction.results.has(
                          this.plugin,
                          'fail',
                          'has_fwd_dns',
                    )
                )
                assert.strictEqual(code, DENYSOFT)
                assert.strictEqual(msg, 'No MX for your FROM address')
            },
            this.connection, 
            [new Address('<jeff@topview.video>')]
            )
        })

        it('Allow - MX is IP address', async () => {
            this.get_mx_Spy.resolves([{"exchange":"64.233.186.26"}])

            this.plugin.cfg.main.allow_mx_ip = true
            await this.plugin.hook_mail((code, msg) => {
                sinon.assert.calledOnce(this.get_mx_Spy)
                sinon.assert.notCalled(this.resolve_mx_hosts_Spy)
                assert.ok(
                    this.connection.transaction.results.has(
                          this.plugin,
                          'pass',
                          'implicit_mx',
                    )
                )
                assert.strictEqual(code, undefined)
                assert.strictEqual(msg, undefined)
            },
            this.connection, 
            [new Address('<test@example.com>')]
            )
        })

        it('Allow - valid MX hostname with IPv6', async () => {
            this.get_mx_Spy.resolves([{"exchange":"alt4.gmail-smtp-in.l.google.com"}])
            this.resolve_mx_hosts_Spy.resolves([{"exchange":"2800:3f0:4003:c00::1a"}])

            await this.plugin.hook_mail((code, msg) => {
                sinon.assert.calledOnce(this.get_mx_Spy)
                sinon.assert.calledOnce(this.resolve_mx_hosts_Spy)
                assert.ok(
                    this.connection.transaction.results.has(
                          this.plugin,
                          'pass',
                          'has_fwd_dns',
                    )
                )
                assert.strictEqual(code, undefined)
                assert.strictEqual(msg, undefined)
            },
            this.connection, 
            [new Address('<test@gmail.com>')]
            )
        })

        it('Allow - valid MX hostname with IPv4', async () => {
            this.get_mx_Spy.resolves([{"exchange":"alt4.gmail-smtp-in.l.google.com"}])
            this.resolve_mx_hosts_Spy.resolves([{"exchange":"64.233.186.26"}])

            await this.plugin.hook_mail((code, msg) => {
                sinon.assert.calledOnce(this.get_mx_Spy)
                sinon.assert.calledOnce(this.resolve_mx_hosts_Spy)
                assert.ok(
                    this.connection.transaction.results.has(
                          this.plugin,
                          'pass',
                          'has_fwd_dns',
                    )
                )
                assert.strictEqual(code, undefined)
                assert.strictEqual(msg, undefined)
            },
            this.connection, 
            [new Address('<test@gmail.com>')]
            )
        })

    })
})
