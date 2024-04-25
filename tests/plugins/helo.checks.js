'use strict';
const assert = require('node:assert')

const path = require('path');
const fixtures = require('haraka-test-fixtures');

const _set_up = (done) => {

    this.plugin = new fixtures.plugin('helo.checks');
    this.plugin.config.root_path = path.resolve('tests', 'config');

    this.connection = fixtures.connection.createConnection();
    this.connection.remote.ip='208.75.199.19';

    this.plugin.register();

    done();
}

describe('helo.checks', () => {

    beforeEach(_set_up)

    it('init is always run', () => {
        assert.equal(this.plugin.register_hook.args[2][0], 'helo');
        assert.equal(this.plugin.register_hook.args[2][1], 'init');
        assert.equal(this.plugin.register_hook.args[3][0], 'ehlo');
        assert.equal(this.plugin.register_hook.args[3][1], 'init');
    })

    it('hooks are registered', () => {
        assert.equal(this.plugin.register_hook.args.length, 24)
    })

    it('test config is loaded', () => {
        assert.deepEqual(this.plugin.cfg, {
            main: {},
            skip: { private_ip: true, whitelist: true, relaying: true },
            bigco: {
                'msn.com': 'msn.com',
                'hotmail.com': 'hotmail.com',
                'yahoo.com': 'yahoo.com,yahoo.co.jp',
                'yahoo.co.jp': 'yahoo.com,yahoo.co.jp',
                'yahoo.co.uk': 'yahoo.co.uk',
                'excite.com': 'excite.com,excitenetwork.com',
                'mailexcite.com': 'excite.com,excitenetwork.com',
                'aol.com': 'aol.com',
                'compuserve.com': 'compuserve.com,adelphia.net',
                'nortelnetworks.com': 'nortelnetworks.com,nortel.com',
                'earthlink.net': 'earthlink.net',
                'earthling.net': 'earthling.net',
                'google.com': 'google.com',
                'gmail.com': 'google.com,gmail.com'
            },
            check: {
                proto_mismatch: true,
                match_re: true,
                bare_ip: true,
                dynamic: true,
                big_company: true,
                valid_hostname: true,
                rdns_match: true,
                forward_dns: true,
                host_mismatch: true,
                literal_mismatch: 2
            },
            reject: {
                proto_mismatch: true,
                match_re: false,
                bare_ip: true,
                dynamic: true,
                big_company: true,
                valid_hostname: true,
                rdns_match: true,
                forward_dns: true,
                host_mismatch: true,
                literal_mismatch: true,
            },
            list_re: /^()$/i,
        })
    })
})

describe('host_mismatch', () => {
    beforeEach(_set_up)

    it('host_mismatch, reject=false', (done) => {
        const outer = this;
        this.plugin.init(() => {}, this.connection, 'helo.example.com');
        this.plugin.cfg.check.host_mismatch=true;
        this.plugin.cfg.reject.host_mismatch=false;
        this.plugin.host_mismatch(function () {
            assert.equal(undefined, arguments[0]);
            assert.ok(outer.connection.results.get('helo.checks').fail.length);
            done();
        }, this.connection, 'anything');
    })

    it('host_mismatch, reject=true', (done) => {
        const outer = this;
        this.plugin.init(() => { }, this.connection, 'helo.example.com');
        this.plugin.cfg.check.host_mismatch=true;
        this.plugin.cfg.reject.host_mismatch=true;
        this.plugin.host_mismatch(function () {
            assert.equal(DENY, arguments[0]);
            assert.ok(outer.connection.results.get('helo.checks').fail.length);
            done();
        }, this.connection, 'anything');
    })
})

describe('proto_mismatch', () => {
    beforeEach(_set_up)

    it('proto_mismatch, reject=false, esmtp=false', (done) => {
        const outer = this;
        this.plugin.init(() => {}, this.connection, 'helo.example.com');
        this.connection.esmtp = false;
        this.plugin.cfg.check.proto_mismatch=true;
        this.plugin.cfg.reject.proto_mismatch=false;
        this.plugin.proto_mismatch(function () {
            assert.equal(undefined, arguments[0]);
            assert.ok(outer.connection.results.get('helo.checks').fail.length);
            done();
        }, this.connection, 'anything', 'esmtp');
    })

    it('proto_mismatch, reject=false, esmtp=true', (done) => {
        const outer = this;
        this.plugin.init(() => { }, this.connection, 'helo.example.com');
        this.connection.esmtp = true;
        this.plugin.cfg.check.proto_mismatch=true;
        this.plugin.cfg.reject.proto_mismatch=false;
        this.plugin.proto_mismatch(function () {
            assert.equal(undefined, arguments[0]);
            assert.ok(outer.connection.results.get('helo.checks').fail.length === 0);
            done();
        }, this.connection, 'anything', 'esmtp');
    })

    it('proto_mismatch, reject=true', (done) => {
        const outer = this;
        this.plugin.init(() => { }, this.connection, 'helo.example.com');
        this.connection.esmtp = false;
        this.plugin.cfg.check.proto_mismatch=true;
        this.plugin.cfg.reject.proto_mismatch=true;
        this.plugin.proto_mismatch(function () {
            assert.equal(DENY, arguments[0]);
            assert.ok(outer.connection.results.get('helo.checks').fail.length);
            done();
        }, this.connection, 'anything', 'esmtp');
    })
})

describe('rdns_match', () => {
    beforeEach(_set_up)

    it('pass', (done) => {
        const outer = this;
        this.connection.remote.host='helo.example.com';
        this.plugin.cfg.check.rdns_match=true;
        this.plugin.cfg.reject.rdns_match=true;
        this.plugin.rdns_match(function () {
            assert.equal(undefined, arguments[0]);
            assert.ok(outer.connection.results.get('helo.checks').pass.length);
            done();
        }, this.connection, 'helo.example.com');
    })

    it('pass (org dom match)', (done) => {
        const outer = this;
        this.connection.remote.host='ehlo.example.com';
        this.plugin.cfg.check.rdns_match=true;
        this.plugin.cfg.reject.rdns_match=false;
        this.plugin.rdns_match(function () {
            assert.equal(undefined, arguments[0]);
            assert.ok(outer.connection.results.get('helo.checks').pass.length);
            done();
        }, this.connection, 'helo.example.com');
    })

    it('fail', (done) => {
        const outer = this;
        this.connection.remote.host='ehlo.gmail.com';
        this.plugin.cfg.check.rdns_match=true;
        this.plugin.cfg.reject.rdns_match=false;
        this.plugin.rdns_match(function () {
            assert.equal(undefined, arguments[0]);
            assert.ok(outer.connection.results.get('helo.checks').fail.length);
            done();
        }, this.connection, 'helo.example.com');
    })

    it('fail, reject', (done) => {
        const outer = this;
        this.connection.remote.host='ehlo.gmail.com';
        this.plugin.cfg.check.rdns_match=true;
        this.plugin.cfg.reject.rdns_match=true;
        this.plugin.rdns_match(function () {
            assert.equal(DENY, arguments[0]);
            assert.ok(outer.connection.results.get('helo.checks').fail.length);
            done();
        }, this.connection, 'helo.example.com');
    })
})

describe('bare_ip', () => {
    beforeEach(_set_up)

    it('pass', (done) => {
        const outer = this;
        this.plugin.cfg.check.bare_ip=true;
        this.plugin.cfg.reject.bare_ip=true;
        this.plugin.bare_ip(function () {
            assert.equal(undefined, arguments[0]);
            assert.ok(outer.connection.results.get('helo.checks').pass.length);
            done();
        }, this.connection, '[192.168.1.2]');
    })
    it('fail', (done) => {
        const outer = this;
        this.plugin.cfg.check.bare_ip=true;
        this.plugin.cfg.reject.bare_ip=false;
        this.plugin.bare_ip(function () {
            assert.equal(undefined, arguments[0]);
            assert.ok(outer.connection.results.get('helo.checks').fail.length);
            done();
        }, this.connection, '192.168.1.1');
    })
    it('fail, reject', (done) => {
        const outer = this;
        this.plugin.cfg.check.bare_ip=true;
        this.plugin.cfg.reject.bare_ip=true;
        this.plugin.bare_ip(function () {
            assert.equal(DENY, arguments[0]);
            assert.ok(outer.connection.results.get('helo.checks').fail.length);
            done();
        }, this.connection, '192.168.1.1');
    })
})

describe('dynamic', () => {
    beforeEach(_set_up)

    it('pass', (done) => {
        const outer = this;
        const test_helo = 'matt.simerson.tld';
        this.connection.remote.ip='208.75.177.99';
        this.plugin.cfg.check.dynamic=true;
        this.plugin.cfg.reject.dynamic=true;
        this.plugin.dynamic(function () {
            assert.equal(undefined, arguments[0]);
            assert.ok(outer.connection.results.get('helo.checks').pass.length);
            done();
        }, this.connection, test_helo);
    })

    it('fail', (done) => {
        const outer = this;
        const test_helo = 'c-76-121-96-159.hsd1.wa.comcast.net';
        this.connection.remote.ip='76.121.96.159';
        this.plugin.cfg.check.dynamic=true;
        this.plugin.cfg.reject.dynamic=false;
        this.plugin.dynamic(function () {
            assert.equal(undefined, arguments[0]);
            assert.ok(outer.connection.results.get('helo.checks').fail.length);
            done();
        }, this.connection, test_helo);
    })

    it('fail, reject', (done) => {
        const outer = this;
        const test_helo = 'c-76-121-96-159.hsd1.wa.comcast.net';
        this.connection.remote.ip='76.121.96.159';
        this.plugin.cfg.check.dynamic=true;
        this.plugin.cfg.reject.dynamic=true;
        this.plugin.dynamic(function () {
            assert.equal(DENY, arguments[0]);
            assert.ok(outer.connection.results.get('helo.checks').fail.length);
            done();
        }, this.connection, test_helo);
    })
})

describe('big_company', () => {
    beforeEach(_set_up)

    it('pass, reject=false', (done) => {
        const outer = this;
        const test_helo = 'yahoo.com';
        this.connection.remote.host='yahoo.com';
        this.plugin.cfg.check.big_company=true;
        this.plugin.cfg.reject.big_company=true;
        this.plugin.big_company(function () {
            assert.equal(undefined, arguments[0]);
            assert.ok(outer.connection.results.get('helo.checks').pass.length);
            done();
        }, this.connection, test_helo);
    })

    it('fail, reject=false', (done) => {
        const outer = this;
        const test_helo = 'yahoo.com';
        this.connection.remote.host='anything-else.com';
        this.connection.remote.is_private=false;
        this.plugin.cfg.check.big_company=true;
        this.plugin.cfg.reject.big_company=false;
        this.plugin.big_company(function () {
            assert.equal(undefined, arguments[0]);
            assert.ok(outer.connection.results.get('helo.checks').fail.length);
            done();
        }, this.connection, test_helo);
    })

    it('fail, reject=true', (done) => {
        const outer = this;
        const test_helo = 'yahoo.com';
        this.connection.remote.host='anything-else.com';
        this.plugin.cfg.check.big_company=true;
        this.plugin.cfg.reject.big_company=true;
        this.plugin.big_company(function () {
            assert.equal(DENY, arguments[0]);
            assert.ok(outer.connection.results.get('helo.checks').fail.length);
            done();
        }, this.connection, test_helo);
    })
})

describe('literal_mismatch', () => {
    beforeEach(_set_up)

    it('pass', (done) => {
        const outer = this;
        const test_helo = '[10.0.1.1]';
        this.connection.remote.ip='10.0.1.1';
        this.connection.remote.is_private=true;
        this.plugin.cfg.check.literal_mismatch=1;
        this.plugin.cfg.reject.literal_mismatch=true;
        this.plugin.literal_mismatch(function () {
            assert.equal(undefined, arguments[0]);
            assert.ok(outer.connection.results.get('helo.checks').skip.length);
            done();
        }, this.connection, test_helo);
    })

    it('pass, network', (done) => {
        const outer = this;
        const test_helo = '[10.0.1.1]';
        this.connection.remote.ip='10.0.1.2';
        this.connection.remote.is_private=true;
        this.plugin.cfg.check.literal_mismatch=2;
        this.plugin.cfg.reject.literal_mismatch=true;
        this.plugin.literal_mismatch(function () {
            assert.equal(undefined, arguments[0]);
            assert.ok(outer.connection.results.get('helo.checks').skip.length);
            done();
        }, this.connection, test_helo);
    })

    it('fail, reject=false', (done) => {
        const outer = this;
        const test_helo = '[10.0.1.1]';
        this.connection.remote.ip='10.0.1.2';
        this.connection.remote.is_private=true;
        this.plugin.cfg.check.literal_mismatch=0;
        this.plugin.cfg.reject.literal_mismatch=false;
        this.plugin.literal_mismatch(function () {
            assert.equal(undefined, arguments[0]);
            assert.ok(outer.connection.results.get('helo.checks').skip.length);
            done();
        }, this.connection, test_helo);
    })

    it('fail, reject=true', (done) => {
        const outer = this;
        const test_helo = '[10.0.1.1]';
        this.connection.remote.ip='10.0.1.2';
        this.connection.remote.is_private=true;
        this.plugin.cfg.check.literal_mismatch=0;
        this.plugin.cfg.reject.literal_mismatch=true;
        this.plugin.literal_mismatch(function () {
            assert.equal(undefined, arguments[0]);
            assert.ok(outer.connection.results.get('helo.checks').skip.length);
            done();
        }, this.connection, test_helo);
    })
})

describe('valid_hostname', () => {
    beforeEach(_set_up)

    it('pass', (done) => {
        const test_helo = 'great.domain.com';
        const outer = this;
        this.plugin.cfg.check.valid_hostname=true;
        this.plugin.cfg.reject.valid_hostname=true;
        this.plugin.valid_hostname(function () {
            assert.equal(undefined, arguments[0]);
            assert.ok(outer.connection.results.get('helo.checks').pass.length);
            done();
        }, this.connection, test_helo);
    })

    it('fail, reject=false', (done) => {
        const test_helo = 'great.domain.non-existent-tld';
        const outer = this;
        this.plugin.cfg.check.valid_hostname=true;
        this.plugin.cfg.reject.valid_hostname=false;
        this.plugin.valid_hostname(function () {
            assert.equal(undefined, arguments[0]);
            assert.ok(outer.connection.results.get('helo.checks').fail.length);
            done();
        }, this.connection, test_helo);
    })

    it('fail, reject=true', (done) => {
        const test_helo = 'great.domain.non-existent-tld';
        const outer = this;
        this.plugin.cfg.check.valid_hostname=true;
        this.plugin.cfg.reject.valid_hostname=true;
        this.plugin.valid_hostname(function () {
            assert.equal(DENY, arguments[0]);
            assert.ok(outer.connection.results.get('helo.checks').fail.length);
            done();
        }, this.connection, test_helo);
    })
})

describe('forward_dns', () => {
    beforeEach(_set_up)

    it('pass', (done) => {
        const outer = this;
        const test_helo = 'b.resolvers.level3.net';
        this.connection.remote.ip='4.2.2.2';
        this.plugin.cfg.check.forward_dns=true;
        this.plugin.cfg.reject.forward_dns=true;
        this.connection.results.add(this.plugin, {pass: 'valid_hostname'});
        this.plugin.forward_dns(function () {
            assert.equal(undefined, arguments[0]);
            assert.ok(outer.connection.results.get('helo.checks').pass.length);
            done();
        }, this.connection, test_helo);
    })

    it('fail, reject=false', (done) => {
        const outer = this;
        const test_helo = 'www.google.com';
        this.connection.remote.ip='66.128.51.163';
        this.plugin.cfg.check.forward_dns=true;
        this.plugin.cfg.reject.forward_dns=false;
        this.plugin.forward_dns(function () {
            assert.equal(undefined, arguments[0]);
            assert.ok(outer.connection.results.get('helo.checks').fail.length);
            done();
        }, this.connection, test_helo);
    })

    it('fail, reject=true', (done) => {
        const outer = this;
        const test_helo = 'www.google.com';
        this.connection.remote.ip = '66.128.51.163';
        this.plugin.cfg.check.forward_dns=true;
        this.plugin.cfg.reject.forward_dns=true;
        this.plugin.forward_dns(function () {
            assert.equal(DENY, arguments[0]);
            assert.ok(outer.connection.results.get('helo.checks').fail.length);
            done();
        }, this.connection, test_helo);
    })
})

describe('match_re', () => {
    beforeEach(_set_up)

    it('miss', (done) => {
        const test_helo = 'not_in_re_list.net';
        this.plugin.cfg.list_re = new RegExp(`^(${['bad.tld'].join('|')})$`, 'i');
        this.plugin.match_re((rc, msg) => {
            assert.equal(undefined, rc);
            assert.equal(undefined, msg);
            assert.ok(this.connection.results.get('helo.checks').pass.length);
            done();
        }, this.connection, test_helo);
    })

    it('hit, reject=no', (done) => {
        const test_helo = 'ylmf-pc';
        this.plugin.cfg.reject.match_re = false;
        this.plugin.cfg.list_re = new RegExp(`^(${['ylmf-pc'].join('|')})$`, 'i');
        this.plugin.match_re((rc, msg) => {
            assert.equal(undefined, rc);
            assert.equal(undefined, msg);
            assert.ok(this.connection.results.get('helo.checks').fail.length);
            done();
        }, this.connection, test_helo);
    })

    it('hit, reject=yes, exact', (done) => {
        const test_helo = 'ylmf-pc';
        this.plugin.cfg.reject.match_re = true;
        this.plugin.cfg.list_re = new RegExp(`^(${['ylmf-pc'].join('|')})$`, 'i');
        this.plugin.match_re((rc, msg) => {
            assert.equal(DENY, rc);
            assert.equal('That HELO not allowed here', msg);
            assert.ok(this.connection.results.get('helo.checks').fail.length);
            done();
        }, this.connection, test_helo);
    })

    it('hit, reject=yes, pattern', (done) => {
        const test_helo = 'ylmf-pc';
        this.plugin.cfg.reject.match_re = true;
        this.plugin.cfg.list_re = new RegExp(`^(${['ylm.*'].join('|')})$`, 'i');
        this.plugin.match_re((rc, msg) => {
            assert.equal(DENY, rc);
            assert.equal('That HELO not allowed here', msg);
            assert.ok(this.connection.results.get('helo.checks').fail.length);
            done();
        }, this.connection, test_helo);
    })
})
