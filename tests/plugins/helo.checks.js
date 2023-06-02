'use strict';

const path         = require('path');
const fixtures     = require('haraka-test-fixtures');

const _set_up = function (done) {

    this.plugin = new fixtures.plugin('helo.checks');
    this.plugin.config.root_path = path.resolve('tests', 'config');

    this.connection = fixtures.connection.createConnection();
    this.connection.remote.ip='208.75.199.19';

    this.plugin.register();

    done();
}

exports.init = {
    setUp: _set_up,
    'ensure init is always run' (test) {
        test.expect(4);
        test.equal(this.plugin.register_hook.args[2][0], 'helo');
        test.equal(this.plugin.register_hook.args[2][1], 'init');
        test.equal(this.plugin.register_hook.args[3][0], 'ehlo');
        test.equal(this.plugin.register_hook.args[3][1], 'init');
        test.done();
    },
    'hooks are registered' (test) {
        test.expect(1);
        test.equal(this.plugin.register_hook.args.length, 24)
        test.done();
    },
    'test config is loaded' (test) {
        test.expect(1);
        test.deepEqual(this.plugin.cfg, {
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
                literal_mismatch: 'true'
            },
            list_re: /^()$/i,
        })
        test.done();
    }
}

exports.host_mismatch = {
    setUp : _set_up,
    'host_mismatch, reject=false' (test) {
        test.expect(2);
        const outer = this;
        this.plugin.init(() => {}, this.connection, 'helo.example.com');
        this.plugin.cfg.check.host_mismatch=true;
        this.plugin.cfg.reject.host_mismatch=false;
        this.plugin.host_mismatch(function () {
            test.equal(undefined, arguments[0]);
            test.ok(outer.connection.results.get('helo.checks').fail.length);
            test.done();
        }, this.connection, 'anything');
    },
    'host_mismatch, reject=true' (test) {
        test.expect(2);
        const outer = this;
        this.plugin.init(() => { }, this.connection, 'helo.example.com');
        this.plugin.cfg.check.host_mismatch=true;
        this.plugin.cfg.reject.host_mismatch=true;
        this.plugin.host_mismatch(function () {
            test.equal(DENY, arguments[0]);
            test.ok(outer.connection.results.get('helo.checks').fail.length);
            test.done();
        }, this.connection, 'anything');
    },
}

exports.proto_mismatch = {
    setUp : _set_up,
    'proto_mismatch, reject=false, esmtp=false' (test) {
        test.expect(2);
        const outer = this;
        this.plugin.init(() => {}, this.connection, 'helo.example.com');
        this.connection.esmtp = false;
        this.plugin.cfg.check.proto_mismatch=true;
        this.plugin.cfg.reject.proto_mismatch=false;
        this.plugin.proto_mismatch(function () {
            test.equal(undefined, arguments[0]);
            test.ok(outer.connection.results.get('helo.checks').fail.length);
            test.done();
        }, this.connection, 'anything', 'esmtp');
    },
    'proto_mismatch, reject=false, esmtp=true' (test) {
        test.expect(2);
        const outer = this;
        this.plugin.init(() => { }, this.connection, 'helo.example.com');
        this.connection.esmtp = true;
        this.plugin.cfg.check.proto_mismatch=true;
        this.plugin.cfg.reject.proto_mismatch=false;
        this.plugin.proto_mismatch(function () {
            test.equal(undefined, arguments[0]);
            test.ok(outer.connection.results.get('helo.checks').fail.length === 0);
            test.done();
        }, this.connection, 'anything', 'esmtp');
    },
    'proto_mismatch, reject=true' (test) {
        test.expect(2);
        const outer = this;
        this.plugin.init(() => { }, this.connection, 'helo.example.com');
        this.connection.esmtp = false;
        this.plugin.cfg.check.proto_mismatch=true;
        this.plugin.cfg.reject.proto_mismatch=true;
        this.plugin.proto_mismatch(function () {
            test.equal(DENY, arguments[0]);
            test.ok(outer.connection.results.get('helo.checks').fail.length);
            test.done();
        }, this.connection, 'anything', 'esmtp');
    },
}

exports.rdns_match = {
    setUp : _set_up,
    'pass' (test) {
        test.expect(2);
        const outer = this;
        this.connection.remote.host='helo.example.com';
        this.plugin.cfg.check.rdns_match=true;
        this.plugin.cfg.reject.rdns_match=true;
        this.plugin.rdns_match(function () {
            test.equal(undefined, arguments[0]);
            test.ok(outer.connection.results.get('helo.checks').pass.length);
            test.done();
        }, this.connection, 'helo.example.com');
    },
    'pass (org dom match)' (test) {
        test.expect(2);
        const outer = this;
        this.connection.remote.host='ehlo.example.com';
        this.plugin.cfg.check.rdns_match=true;
        this.plugin.cfg.reject.rdns_match=false;
        this.plugin.rdns_match(function () {
            test.equal(undefined, arguments[0]);
            test.ok(outer.connection.results.get('helo.checks').pass.length);
            test.done();
        }, this.connection, 'helo.example.com');
    },
    'fail' (test) {
        test.expect(2);
        const outer = this;
        this.connection.remote.host='ehlo.gmail.com';
        this.plugin.cfg.check.rdns_match=true;
        this.plugin.cfg.reject.rdns_match=false;
        this.plugin.rdns_match(function () {
            test.equal(undefined, arguments[0]);
            test.ok(outer.connection.results.get('helo.checks').fail.length);
            test.done();
        }, this.connection, 'helo.example.com');
    },
    'fail, reject' (test) {
        test.expect(2);
        const outer = this;
        this.connection.remote.host='ehlo.gmail.com';
        this.plugin.cfg.check.rdns_match=true;
        this.plugin.cfg.reject.rdns_match=true;
        this.plugin.rdns_match(function () {
            test.equal(DENY, arguments[0]);
            test.ok(outer.connection.results.get('helo.checks').fail.length);
            test.done();
        }, this.connection, 'helo.example.com');
    },
}

exports.bare_ip = {
    setUp : _set_up,
    'pass' (test) {
        test.expect(2);
        const outer = this;
        this.plugin.cfg.check.bare_ip=true;
        this.plugin.cfg.reject.bare_ip=true;
        this.plugin.bare_ip(function () {
            test.equal(undefined, arguments[0]);
            test.ok(outer.connection.results.get('helo.checks').pass.length);
            test.done();
        }, this.connection, '[192.168.1.2]');
    },
    'fail' (test) {
        test.expect(2);
        const outer = this;
        this.plugin.cfg.check.bare_ip=true;
        this.plugin.cfg.reject.bare_ip=false;
        this.plugin.bare_ip(function () {
            test.equal(undefined, arguments[0]);
            test.ok(outer.connection.results.get('helo.checks').fail.length);
            test.done();
        }, this.connection, '192.168.1.1');
    },
    'fail, reject' (test) {
        test.expect(2);
        const outer = this;
        this.plugin.cfg.check.bare_ip=true;
        this.plugin.cfg.reject.bare_ip=true;
        this.plugin.bare_ip(function () {
            test.equal(DENY, arguments[0]);
            test.ok(outer.connection.results.get('helo.checks').fail.length);
            test.done();
        }, this.connection, '192.168.1.1');
    },
}

exports.dynamic = {
    setUp : _set_up,
    'pass' (test) {
        test.expect(2);
        const outer = this;
        const test_helo = 'matt.simerson.tld';
        this.connection.remote.ip='208.75.177.99';
        this.plugin.cfg.check.dynamic=true;
        this.plugin.cfg.reject.dynamic=true;
        this.plugin.dynamic(function () {
            test.equal(undefined, arguments[0]);
            test.ok(outer.connection.results.get('helo.checks').pass.length);
            test.done();
        }, this.connection, test_helo);
    },
    'fail' (test) {
        test.expect(2);
        const outer = this;
        const test_helo = 'c-76-121-96-159.hsd1.wa.comcast.net';
        this.connection.remote.ip='76.121.96.159';
        this.plugin.cfg.check.dynamic=true;
        this.plugin.cfg.reject.dynamic=false;
        this.plugin.dynamic(function () {
            test.equal(undefined, arguments[0]);
            test.ok(outer.connection.results.get('helo.checks').fail.length);
            test.done();
        }, this.connection, test_helo);
    },
    'fail, reject' (test) {
        test.expect(2);
        const outer = this;
        const test_helo = 'c-76-121-96-159.hsd1.wa.comcast.net';
        this.connection.remote.ip='76.121.96.159';
        this.plugin.cfg.check.dynamic=true;
        this.plugin.cfg.reject.dynamic=true;
        this.plugin.dynamic(function () {
            test.equal(DENY, arguments[0]);
            test.ok(outer.connection.results.get('helo.checks').fail.length);
            test.done();
        }, this.connection, test_helo);
    },
}

exports.big_company = {
    setUp : _set_up,
    'pass, reject=false' (test) {
        test.expect(2);
        const outer = this;
        const test_helo = 'yahoo.com';
        this.connection.remote.host='yahoo.com';
        this.plugin.cfg.check.big_company=true;
        this.plugin.cfg.reject.big_company=true;
        this.plugin.big_company(function () {
            test.equal(undefined, arguments[0]);
            test.ok(outer.connection.results.get('helo.checks').pass.length);
            test.done();
        }, this.connection, test_helo);
    },
    'fail, reject=false' (test) {
        test.expect(2);
        const outer = this;
        const test_helo = 'yahoo.com';
        this.connection.remote.host='anything-else.com';
        this.connection.remote.is_private=false;
        this.plugin.cfg.check.big_company=true;
        this.plugin.cfg.reject.big_company=false;
        this.plugin.big_company(function () {
            test.equal(undefined, arguments[0]);
            test.ok(outer.connection.results.get('helo.checks').fail.length);
            test.done();
        }, this.connection, test_helo);
    },
    'fail, reject=true' (test) {
        test.expect(2);
        const outer = this;
        const test_helo = 'yahoo.com';
        this.connection.remote.host='anything-else.com';
        this.plugin.cfg.check.big_company=true;
        this.plugin.cfg.reject.big_company=true;
        this.plugin.big_company(function () {
            test.equal(DENY, arguments[0]);
            test.ok(outer.connection.results.get('helo.checks').fail.length);
            test.done();
        }, this.connection, test_helo);
    },
}

exports.literal_mismatch = {
    setUp : _set_up,
    'pass' (test) {
        test.expect(2);
        const outer = this;
        const test_helo = '[10.0.1.1]';
        this.connection.remote.ip='10.0.1.1';
        this.connection.remote.is_private=true;
        this.plugin.cfg.check.literal_mismatch=1;
        this.plugin.cfg.reject.literal_mismatch=true;
        this.plugin.literal_mismatch(function () {
            test.equal(undefined, arguments[0]);
            test.ok(outer.connection.results.get('helo.checks').skip.length);
            test.done();
        }, this.connection, test_helo);
    },
    'pass, network' (test) {
        test.expect(2);
        const outer = this;
        const test_helo = '[10.0.1.1]';
        this.connection.remote.ip='10.0.1.2';
        this.connection.remote.is_private=true;
        this.plugin.cfg.check.literal_mismatch=2;
        this.plugin.cfg.reject.literal_mismatch=true;
        this.plugin.literal_mismatch(function () {
            test.equal(undefined, arguments[0]);
            test.ok(outer.connection.results.get('helo.checks').skip.length);
            test.done();
        }, this.connection, test_helo);
    },
    'fail, reject=false' (test) {
        test.expect(2);
        const outer = this;
        const test_helo = '[10.0.1.1]';
        this.connection.remote.ip='10.0.1.2';
        this.connection.remote.is_private=true;
        this.plugin.cfg.check.literal_mismatch=0;
        this.plugin.cfg.reject.literal_mismatch=false;
        this.plugin.literal_mismatch(function () {
            test.equal(undefined, arguments[0]);
            test.ok(outer.connection.results.get('helo.checks').skip.length);
            test.done();
        }, this.connection, test_helo);
    },
    'fail, reject=true' (test) {
        test.expect(2);
        const outer = this;
        const test_helo = '[10.0.1.1]';
        this.connection.remote.ip='10.0.1.2';
        this.connection.remote.is_private=true;
        this.plugin.cfg.check.literal_mismatch=0;
        this.plugin.cfg.reject.literal_mismatch=true;
        this.plugin.literal_mismatch(function () {
            test.equal(undefined, arguments[0]);
            test.ok(outer.connection.results.get('helo.checks').skip.length);
            test.done();
        }, this.connection, test_helo);
    },
}

exports.valid_hostname = {
    setUp : _set_up,
    'pass' (test) {
        test.expect(2);
        const test_helo = 'great.domain.com';
        const outer = this;
        this.plugin.cfg.check.valid_hostname=true;
        this.plugin.cfg.reject.valid_hostname=true;
        this.plugin.valid_hostname(function () {
            test.equal(undefined, arguments[0]);
            test.ok(outer.connection.results.get('helo.checks').pass.length);
            test.done();
        }, this.connection, test_helo);
    },
    'fail, reject=false' (test) {
        test.expect(2);
        const test_helo = 'great.domain.non-existent-tld';
        const outer = this;
        this.plugin.cfg.check.valid_hostname=true;
        this.plugin.cfg.reject.valid_hostname=false;
        this.plugin.valid_hostname(function () {
            test.equal(undefined, arguments[0]);
            test.ok(outer.connection.results.get('helo.checks').fail.length);
            test.done();
        }, this.connection, test_helo);
    },
    'fail, reject=true' (test) {
        test.expect(2);
        const test_helo = 'great.domain.non-existent-tld';
        const outer = this;
        this.plugin.cfg.check.valid_hostname=true;
        this.plugin.cfg.reject.valid_hostname=true;
        this.plugin.valid_hostname(function () {
            test.equal(DENY, arguments[0]);
            test.ok(outer.connection.results.get('helo.checks').fail.length);
            test.done();
        }, this.connection, test_helo);
    },
}

exports.forward_dns = {
    setUp : _set_up,
    'pass' (test) {
        test.expect(2);
        const outer = this;
        const test_helo = 'b.resolvers.level3.net';
        this.connection.remote.ip='4.2.2.2';
        this.plugin.cfg.check.forward_dns=true;
        this.plugin.cfg.reject.forward_dns=true;
        this.connection.results.add(this.plugin, {pass: 'valid_hostname'});
        this.plugin.forward_dns(function () {
            test.equal(undefined, arguments[0]);
            test.ok(outer.connection.results.get('helo.checks').pass.length);
            test.done();
        }, this.connection, test_helo);
    },
    'fail, reject=false' (test) {
        test.expect(2);
        const outer = this;
        const test_helo = 'www.google.com';
        this.connection.remote.ip='66.128.51.163';
        this.plugin.cfg.check.forward_dns=true;
        this.plugin.cfg.reject.forward_dns=false;
        this.plugin.forward_dns(function () {
            test.equal(undefined, arguments[0]);
            test.ok(outer.connection.results.get('helo.checks').fail.length);
            test.done();
        }, this.connection, test_helo);
    },
    'fail, reject=true' (test) {
        test.expect(2);
        const outer = this;
        const test_helo = 'www.google.com';
        this.connection.remote.ip = '66.128.51.163';
        this.plugin.cfg.check.forward_dns=true;
        this.plugin.cfg.reject.forward_dns=true;
        this.plugin.forward_dns(function () {
            test.equal(DENY, arguments[0]);
            test.ok(outer.connection.results.get('helo.checks').fail.length);
            test.done();
        }, this.connection, test_helo);
    },
}

exports.match_re = {
    setUp : _set_up,
    'miss' (test) {
        test.expect(3);
        const test_helo = 'not_in_re_list.net';
        this.plugin.cfg.list_re = new RegExp(`^(${['bad.tld'].join('|')})$`, 'i');
        this.plugin.match_re((rc, msg) => {
            test.equal(undefined, rc);
            test.equal(undefined, msg);
            test.ok(this.connection.results.get('helo.checks').pass.length);
            test.done();
        }, this.connection, test_helo);
    },
    'hit, reject=no' (test) {
        test.expect(3);
        const test_helo = 'ylmf-pc';
        this.plugin.cfg.reject.match_re = false;
        this.plugin.cfg.list_re = new RegExp(`^(${['ylmf-pc'].join('|')})$`, 'i');
        this.plugin.match_re((rc, msg) => {
            test.equal(undefined, rc);
            test.equal(undefined, msg);
            test.ok(this.connection.results.get('helo.checks').fail.length);
            test.done();
        }, this.connection, test_helo);
    },
    'hit, reject=yes, exact' (test) {
        test.expect(3);
        const test_helo = 'ylmf-pc';
        this.plugin.cfg.reject.match_re = true;
        this.plugin.cfg.list_re = new RegExp(`^(${['ylmf-pc'].join('|')})$`, 'i');
        this.plugin.match_re((rc, msg) => {
            test.equal(DENY, rc);
            test.equal('That HELO not allowed here', msg);
            test.ok(this.connection.results.get('helo.checks').fail.length);
            test.done();
        }, this.connection, test_helo);
    },
    'hit, reject=yes, pattern' (test) {
        test.expect(3);
        const test_helo = 'ylmf-pc';
        this.plugin.cfg.reject.match_re = true;
        this.plugin.cfg.list_re = new RegExp(`^(${['ylm.*'].join('|')})$`, 'i');
        this.plugin.match_re((rc, msg) => {
            test.equal(DENY, rc);
            test.equal('That HELO not allowed here', msg);
            test.ok(this.connection.results.get('helo.checks').fail.length);
            test.done();
        }, this.connection, test_helo);
    },
}
