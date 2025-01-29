'use strict'
const assert        = require('node:assert')
const sinon         = require('sinon')

const fixtures      = require('haraka-test-fixtures')
const Address       = require('address-rfc2821').Address
const net_utils     = require('haraka-net-utils')

const dnsPromises   = require('node:dns').promises
const { Resolver }  = dnsPromises

describe('mail_from.is_resolvable', function() {
  beforeEach(function() {
    this.plugin = new fixtures.plugin('mail_from.is_resolvable')
    this.plugin.register()

    this.connection = fixtures.connection.createConnection()
    this.connection.init_transaction()

    this.txt = this.connection.transaction

    this.get_mx_spy = sinon.stub(net_utils, 'get_mx')

    this.next = sinon.stub()

    this.domain = 'example.com'
  })

  afterEach(function() {
    sinon.restore()
  })

  describe('hook_mail', function() {
    it('Allow - mail_from without host', async function() {
      await this.plugin.hook_mail(this.next, this.connection, [{}])

      assert.equal(this.txt.results.get(this.plugin).skip, 'null host')
      sinon.assert.notCalled(this.get_mx_spy)
      sinon.assert.calledOnce(this.next)
      assert.strictEqual(this.next.getCall(0).args.length, 0)
    })

    it('DENYSOFT - get_mx timeout', async function() {
     // Configure the stub to simulate a timeout
      const timeoutError = new Error('DNS request timed out')
      timeoutError.code = dnsPromises.TIMEOUT

      this.get_mx_spy.rejects(timeoutError)

      await this.plugin.hook_mail(this.next, this.connection, [new Address(`<test@${this.domain}>`)])

      assert.ok(this.txt.results.has(this.plugin, 'err', `${this.domain}:DNS request timed out`))
      sinon.assert.calledOnceWithExactly(this.get_mx_spy, this.domain)
      sinon.assert.calledWith(this.next, DENYSOFT, `Temp. resolver error (${dnsPromises.TIMEOUT})`)
    })

    it('DENYSOFT - resolveMx timeout', async function() {
      this.plugin.cfg.reject.no_mx = true

      this.get_mx_spy.restore()

      const timeoutError = new Error('DNS request timed out')
      timeoutError.code = dnsPromises.TIMEOUT

      this.resolveMx_stub = sinon.stub(Resolver.prototype, 'resolveMx')
      this.resolveMx_stub.rejects(timeoutError)

      await this.plugin.hook_mail(this.next, this.connection, [new Address(`<test@${this.domain}>`)])

      assert.ok(this.txt.results.has(this.plugin, 'err', `${this.domain}:DNS request timed out`))
      sinon.assert.calledOnceWithExactly(this.resolveMx_stub, this.domain)
      sinon.assert.calledWith(this.next, DENYSOFT, `Temp. resolver error (${dnsPromises.TIMEOUT})`)
    })

    it('DENY - No MX for your FROM address', async function() {
      this.get_mx_spy.resolves([])

      await this.plugin.hook_mail(this.next, this.connection, [new Address(`<test@${this.domain}>`)])

      assert.ok(this.txt.results.has(this.plugin, 'fail', 'has_fwd_dns'))
      sinon.assert.calledOnceWithExactly(this.get_mx_spy, this.domain)
      sinon.assert.calledOnce(this.next)
      sinon.assert.calledWith(this.next, DENY, 'No MX for your FROM address')
    })

    it('DENYSOFT - No MX for your FROM address', async function() {
      this.plugin.cfg.reject.no_mx = false
      this.get_mx_spy.resolves([])

      await this.plugin.hook_mail(this.next, this.connection, [new Address(`<test@${this.domain}>`)])

      assert.ok(this.txt.results.has(this.plugin, 'fail', 'has_fwd_dns'))
      sinon.assert.calledOnceWithExactly(this.get_mx_spy, this.domain)
      sinon.assert.calledOnce(this.next)
      sinon.assert.calledWith(this.next, DENYSOFT, 'No MX for your FROM address')
    })

    it('Allow - MX is IP address', async function() {
      this.get_mx_spy.resolves([{"exchange":"64.233.186.26"}])

      this.plugin.cfg.main.allow_mx_ip = true

      await this.plugin.hook_mail(this.next, this.connection, [new Address(`<test@${this.domain}>`)])

      assert.ok(this.txt.results.has(this.plugin, 'pass', 'implicit_mx'))
      sinon.assert.calledOnceWithExactly(this.get_mx_spy, this.domain)
      sinon.assert.calledOnce(this.next)
      assert.strictEqual(this.next.getCall(0).args.length, 0)
    })

    it('DENY - resolve4 and resolve6 both timeout', async function() {
      this.plugin.cfg.reject.no_mx = true

      this.get_mx_spy.resolves([{"exchange":`mx.${this.domain}`}])

      this.resolveMx_stub = sinon.stub(Resolver.prototype, 'resolveMx')
      this.resolveMx_stub.resolves([])

      const timeoutError = new Error('DNS request timed out')
      timeoutError.code = dnsPromises.TIMEOUT

      this.resolve4_spy = sinon.stub(Resolver.prototype, 'resolve4')
      this.resolve4_spy.rejects(timeoutError)

      this.resolve6_spy = sinon.stub(Resolver.prototype, 'resolve6')
      this.resolve6_spy.rejects(timeoutError)

      await this.plugin.hook_mail(this.next, this.connection, [new Address(`<test@${this.domain}>`)])

      sinon.assert.calledOnceWithExactly(this.resolve6_spy, `mx.${this.domain}`)
      sinon.assert.calledOnceWithExactly(this.resolve4_spy, `mx.${this.domain}`)
      sinon.assert.calledOnce(this.next)
      sinon.assert.calledWith(this.next, DENY, 'No valid MX for your FROM address')
    })

    it('DENY - DNS server failure', async function() {
      this.plugin.cfg.reject.no_mx = true

      this.get_mx_spy.resolves([{"exchange":`mx.${this.domain}`}])

      const timeoutError = new Error('DNS Server Failure')
      timeoutError.code = dnsPromises.SERVFAIL

      this.resolve4_spy = sinon.stub(Resolver.prototype, 'resolve4')
      this.resolve4_spy.rejects(timeoutError)

      this.resolve6_spy = sinon.stub(Resolver.prototype, 'resolve6')
      this.resolve6_spy.rejects(timeoutError)

      await this.plugin.hook_mail(this.next, this.connection, [new Address(`<test@${this.domain}>`)])

      sinon.assert.calledOnceWithExactly(this.resolve6_spy, `mx.${this.domain}`)
      sinon.assert.calledOnceWithExactly(this.resolve4_spy, `mx.${this.domain}`)
      sinon.assert.calledOnce(this.next)
      sinon.assert.calledWith(this.next, DENY, 'No valid MX for your FROM address')
    })

    it('DENYSOFT - No valid MX for the FROM address', async function() {
      this.plugin.cfg.reject.no_mx = false
      this.get_mx_spy.resolves([{"exchange":"64.233.186.26"}])

      await this.plugin.hook_mail(this.next, this.connection, [new Address(`<test@${this.domain}>`)])

      assert.ok(this.txt.results.has(this.plugin, 'fail', 'has_fwd_dns'))
      sinon.assert.calledOnceWithExactly(this.get_mx_spy, this.domain)
      sinon.assert.calledOnce(this.next)
      sinon.assert.calledWith(this.next, DENYSOFT, 'No valid MX for your FROM address')
    })

    it('DENY - No valid MX for the FROM address', async function() {
      this.get_mx_spy.resolves([{"exchange":"64.233.186.26"}])

      await this.plugin.hook_mail(this.next, this.connection, [new Address(`<test@${this.domain}>`)])

      assert.ok(this.txt.results.has(this.plugin, 'fail', 'has_fwd_dns'))
      sinon.assert.calledOnceWithExactly(this.get_mx_spy, this.domain)
      sinon.assert.calledOnce(this.next)
      sinon.assert.calledWith(this.next, DENY, 'No valid MX for your FROM address')
    })

    it('Allow - valid MX hostname resolved to IPv6', async function() {
      this.resolve_mx_hosts_spy = sinon.stub(net_utils, 'resolve_mx_hosts')

      this.get_mx_spy.resolves([{"exchange":"gmail-smtp-in.l.google.com"}])
      this.resolve_mx_hosts_spy.resolves([{"exchange":"2607:f8b0:4001:c2f::1a"}])

      await this.plugin.hook_mail(this.next, this.connection, [new Address(`<test@gmail.com>`)])

      sinon.assert.calledOnceWithExactly(this.get_mx_spy, 'gmail.com')
      sinon.assert.calledOnce(this.resolve_mx_hosts_spy)
      sinon.assert.calledOnce(this.next)
      assert.strictEqual(this.next.getCall(0).args.length, 0)
    })

    it('Allow - valid MX hostname resolved to IPv4', async function() {
      this.resolve_mx_hosts_spy = sinon.stub(net_utils, 'resolve_mx_hosts')

      this.get_mx_spy.resolves([{"exchange":"gmail-smtp-in.l.google.com"}])
      this.resolve_mx_hosts_spy.resolves([{"exchange":"64.233.186.26"}])

      await this.plugin.hook_mail(this.next, this.connection, [new Address('<test@gmail.com>')])

      assert.ok(this.txt.results.has(this.plugin, 'pass', 'has_fwd_dns'))
      sinon.assert.calledOnceWithExactly(this.get_mx_spy, 'gmail.com')
      sinon.assert.calledOnceWithExactly(this.resolve_mx_hosts_spy, [{"exchange":"gmail-smtp-in.l.google.com"}])
      sinon.assert.calledOnce(this.next)
      assert.strictEqual(this.next.getCall(0).args.length, 0)
    })

    it('DENY - MX hostname does not resolve', async function() {
      this.resolve_mx_hosts_spy = sinon.stub(net_utils, 'resolve_mx_hosts')

      this.get_mx_spy.resolves([{"exchange":"mx.${this.domain}"}])
      this.resolve_mx_hosts_spy.resolves([])

      await this.plugin.hook_mail(this.next, this.connection, [new Address(`<test@${this.domain}>`)])

      sinon.assert.calledOnce(this.get_mx_spy)
      sinon.assert.calledOnce(this.resolve_mx_hosts_spy)
      sinon.assert.calledOnce(this.next)
      sinon.assert.calledWith(this.next, DENY, 'No valid MX for your FROM address')
    })
  })
})
