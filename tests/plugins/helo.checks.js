'use strict';

const path         = require('path');
const fixtures     = require('haraka-test-fixtures');

const { stub }         = fixtures.stub;

// Test domains
const test_helo_classa = '[10.0.1.1]';
const test_helo_comcast = 'c-76-121-96-159.hsd1.wa.comcast.net';
const test_helo_google = 'www.google.com';
const test_helo_great = 'great.domain.com';
const test_helo_level3 = 'b.resolvers.level3.net';
const test_helo_matt = 'matt.simerson.tld';
const test_helo_not_re = 'not_in_re_list.net';
const test_helo_yahoo = 'yahoo.com';
const test_helo_ylmf = 'ylmf-pc';

const _set_up = function (done) {

    this.plugin = new fixtures.plugin('helo.checks');
    this.plugin.config.root_path = path.resolve(__dirname, '../../config');

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
    }
}

exports.host_mismatch = {
    setUp : _set_up,
    'host_mismatch, reject=false' (test) {
        test.expect(2);
        const outer = this;
        const cb = function () {
            test.equal(undefined, arguments[0]);
            test.ok(outer.connection.results.get('helo.checks').fail.length);
        };
        this.plugin.init(stub, this.connection, 'helo.example.com');
        this.plugin.cfg.check.host_mismatch=true;
        this.plugin.cfg.reject.host_mismatch=false;
        this.plugin.host_mismatch(cb, this.connection, 'anything');
        test.done();
    },
    'host_mismatch, reject=true' (test) {
        test.expect(2);
        const outer = this;
        const cb = function () {
            test.equal(DENY, arguments[0]);
            // console.log(outer.connection.results.get('helo.checks'));
            test.ok(outer.connection.results.get('helo.checks').fail.length);
        };
        this.plugin.init(stub, this.connection, 'helo.example.com');
        this.plugin.cfg.check.host_mismatch=true;
        this.plugin.cfg.reject.host_mismatch=true;
        this.plugin.host_mismatch(cb, this.connection, 'anything');
        test.done();
    },
}

exports.proto_mismatch = {
    setUp : _set_up,
    'proto_mismatch, reject=false, esmtp=false' (test) {
        test.expect(2);
        const outer = this;
        const cb = function () {
            test.equal(undefined, arguments[0]);
            // console.log(outer.connection.results.get('helo.checks'));
            test.ok(outer.connection.results.get('helo.checks').fail.length);
        };
        this.plugin.init(stub, this.connection, 'helo.example.com');
        this.connection.esmtp = false;
        this.plugin.cfg.check.proto_mismatch=true;
        this.plugin.cfg.reject.proto_mismatch=false;
        this.plugin.proto_mismatch(cb, this.connection, 'anything', 'esmtp');
        test.done();
    },
    'proto_mismatch, reject=false, esmtp=true' (test) {
        test.expect(2);
        const outer = this;
        const cb = function () {
            test.equal(undefined, arguments[0]);
            // console.log(outer.connection.results.get('helo.checks'));
            test.ok(outer.connection.results.get('helo.checks').fail.length === 0);
        };
        this.plugin.init(stub, this.connection, 'helo.example.com');
        this.connection.esmtp = true;
        this.plugin.cfg.check.proto_mismatch=true;
        this.plugin.cfg.reject.proto_mismatch=false;
        this.plugin.proto_mismatch(cb, this.connection, 'anything', 'esmtp');
        test.done();
    },
    'proto_mismatch, reject=true' (test) {
        test.expect(2);
        const outer = this;
        const cb = function () {
            test.equal(DENY, arguments[0]);
            // console.log(outer.connection.results.get('helo.checks'));
            test.ok(outer.connection.results.get('helo.checks').fail.length);
        };
        this.plugin.init(stub, this.connection, 'helo.example.com');
        this.connection.esmtp = false;
        this.plugin.cfg.check.proto_mismatch=true;
        this.plugin.cfg.reject.proto_mismatch=true;
        this.plugin.proto_mismatch(cb, this.connection, 'anything', 'esmtp');
        test.done();
    },
}

exports.rdns_match = {
    setUp : _set_up,
    'pass' (test) {
        test.expect(2);
        const outer = this;
        const cb = function () {
            test.equal(undefined, arguments[0]);
            test.ok(outer.connection.results.get('helo.checks').pass.length);
        };
        this.plugin.init(stub, this.connection, 'helo.example.com');
        this.connection.remote.host='helo.example.com';
        this.plugin.cfg.check.rdns_match=true;
        this.plugin.cfg.reject.rdns_match=true;
        this.plugin.rdns_match(cb, this.connection, 'helo.example.com');
        test.done();
    },
    'pass (org dom match)' (test) {
        test.expect(2);
        const outer = this;
        const cb = function () {
            test.equal(undefined, arguments[0]);
            // console.log(outer.connection.results.get('helo.checks'));
            test.ok(outer.connection.results.get('helo.checks').pass.length);
        };
        this.plugin.init(stub, this.connection, 'helo.example.com');
        this.connection.remote.host='ehlo.example.com';
        this.plugin.cfg.check.rdns_match=true;
        this.plugin.cfg.reject.rdns_match=false;
        this.plugin.rdns_match(cb, this.connection, 'helo.example.com');
        test.done();
    },
    'fail' (test) {
        test.expect(2);
        const outer = this;
        const cb = function () {
            test.equal(undefined, arguments[0]);
            // console.log(outer.connection.results.get('helo.checks'));
            test.ok(outer.connection.results.get('helo.checks').fail.length);
        };
        this.plugin.init(stub, this.connection, 'helo.example.com');
        this.connection.remote.host='ehlo.gmail.com';
        this.plugin.cfg.check.rdns_match=true;
        this.plugin.cfg.reject.rdns_match=false;
        this.plugin.rdns_match(cb, this.connection, 'helo.example.com');
        test.done();
    },
    'fail, reject' (test) {
        test.expect(2);
        const outer = this;
        const cb = function () {
            test.equal(DENY, arguments[0]);
            // console.log(outer.connection.results.get('helo.checks'));
            test.ok(outer.connection.results.get('helo.checks').fail.length);
        };
        this.plugin.init(stub, this.connection, 'helo.example.com');
        this.connection.remote.host='ehlo.gmail.com';
        this.plugin.cfg.check.rdns_match=true;
        this.plugin.cfg.reject.rdns_match=true;
        this.plugin.rdns_match(cb, this.connection, 'helo.example.com');
        test.done();
    },
}

exports.bare_ip = {
    setUp : _set_up,
    'pass' (test) {
        test.expect(2);
        const outer = this;
        const cb = function () {
            test.equal(undefined, arguments[0]);
            test.ok(outer.connection.results.get('helo.checks').pass.length);
        };
        this.plugin.init(stub, this.connection, '[192.168.1.2]');
        this.plugin.cfg.check.bare_ip=true;
        this.plugin.cfg.reject.bare_ip=true;
        this.plugin.bare_ip(cb, this.connection, '[192.168.1.2]');
        test.done();
    },
    'fail' (test) {
        test.expect(2);
        const outer = this;
        const cb = function () {
            test.equal(undefined, arguments[0]);
            test.ok(outer.connection.results.get('helo.checks').fail.length);
        };
        this.plugin.init(stub, this.connection, '192.168.1.1');
        this.plugin.cfg.check.bare_ip=true;
        this.plugin.cfg.reject.bare_ip=false;
        this.plugin.bare_ip(cb, this.connection, '192.168.1.1');
        test.done();
    },
    'fail, reject' (test) {
        test.expect(2);
        const outer = this;
        const cb = function () {
            test.equal(DENY, arguments[0]);
            // console.log(outer.connection.results.get('helo.checks'));
            test.ok(outer.connection.results.get('helo.checks').fail.length);
        };
        this.plugin.init(stub, this.connection, '192.168.1.1');
        this.plugin.cfg.check.bare_ip=true;
        this.plugin.cfg.reject.bare_ip=true;
        this.plugin.bare_ip(cb, this.connection, '192.168.1.1');
        test.done();
    },
}

exports.dynamic = {
    setUp : _set_up,
    'pass' (test) {
        test.expect(2);
        const outer = this;
        const cb = function () {
            test.equal(undefined, arguments[0]);
            test.ok(outer.connection.results.get('helo.checks').pass.length);
        };
        this.connection.remote.ip='208.75.177.99';
        this.plugin.init(stub, this.connection, test_helo_matt);
        this.plugin.cfg.check.dynamic=true;
        this.plugin.cfg.reject.dynamic=true;
        this.plugin.dynamic(cb, this.connection, test_helo_matt);
        test.done();
    },
    'fail' (test) {
        test.expect(2);
        const outer = this;
        const cb = function () {
            test.equal(undefined, arguments[0]);
            // console.log(outer.connection.results.get('helo.checks'));
            test.ok(outer.connection.results.get('helo.checks').fail.length);
        };
        this.connection.remote.ip='76.121.96.159';
        this.plugin.init(stub, this.connection, test_helo_comcast);
        this.plugin.cfg.check.dynamic=true;
        this.plugin.cfg.reject.dynamic=false;
        this.plugin.dynamic(cb, this.connection, test_helo_comcast);
        test.done();
    },
    'fail, reject' (test) {
        test.expect(2);
        const outer = this;
        const cb = function () {
            test.equal(DENY, arguments[0]);
            // console.log(outer.connection.results.get('helo.checks'));
            test.ok(outer.connection.results.get('helo.checks').fail.length);
        };
        this.connection.remote.ip='76.121.96.159';
        this.plugin.init(stub, this.connection, test_helo_comcast);
        this.plugin.cfg.check.dynamic=true;
        this.plugin.cfg.reject.dynamic=true;
        this.plugin.dynamic(cb, this.connection, test_helo_comcast);
        test.done();
    },
}

exports.big_company = {
    setUp : _set_up,
    'pass, reject=false' (test) {
        test.expect(2);
        const outer = this;
        const cb = function () {
            test.equal(undefined, arguments[0]);
            test.ok(outer.connection.results.get('helo.checks').pass.length);
            test.done();
        };
        this.connection.remote.host='yahoo.com';
        this.plugin.init(stub, this.connection, test_helo_yahoo);
        this.plugin.cfg.check.big_company=true;
        this.plugin.cfg.reject.big_company=true;
        this.plugin.big_company(cb, this.connection, test_helo_yahoo);
    },
    'fail, reject=false' (test) {
        test.expect(2);
        const outer = this;
        const cb = function () {
            test.equal(undefined, arguments[0]);
            test.ok(outer.connection.results.get('helo.checks').fail.length);
            test.done();
        };
        this.connection.remote.host='anything-else.com';
        this.connection.remote.is_private=false;
        this.plugin.init(stub, this.connection, test_helo_yahoo);
        this.plugin.cfg.check.big_company=true;
        this.plugin.cfg.reject.big_company=false;
        this.plugin.big_company(cb, this.connection, test_helo_yahoo);
    },
    'fail, reject=true' (test) {
        test.expect(2);
        const outer = this;
        const cb = function () {
            test.equal(DENY, arguments[0]);
            test.ok(outer.connection.results.get('helo.checks').fail.length);
            test.done();
        };
        this.connection.remote.host='anything-else.com';
        this.plugin.init(stub, this.connection, test_helo_yahoo);
        this.plugin.cfg.check.big_company=true;
        this.plugin.cfg.reject.big_company=true;
        this.plugin.big_company(cb, this.connection, test_helo_yahoo);
    },
}

exports.literal_mismatch = {
    setUp : _set_up,
    'pass' (test) {
        test.expect(2);
        const outer = this;
        const cb = function () {
            // console.log(outer.connection.results.get('helo.checks'));
            test.equal(undefined, arguments[0]);
            test.ok(outer.connection.results.get('helo.checks').skip.length);
            test.done();
        };
        this.connection.remote.ip='10.0.1.1';
        this.connection.remote.is_private=true;
        this.plugin.init(stub, this.connection, test_helo_classa);
        this.plugin.cfg.check.literal_mismatch=1;
        this.plugin.cfg.reject.literal_mismatch=true;
        this.plugin.literal_mismatch(cb, this.connection, test_helo_classa);
    },
    'pass, network' (test) {
        test.expect(2);
        const outer = this;
        const cb = function () {
            // console.log(outer.connection.results.get('helo.checks'));
            test.equal(undefined, arguments[0]);
            test.ok(outer.connection.results.get('helo.checks').skip.length);
            test.done();
        };
        this.connection.remote.ip='10.0.1.2';
        this.connection.remote.is_private=true;
        this.plugin.init(stub, this.connection, test_helo_classa);
        this.plugin.cfg.check.literal_mismatch=2;
        this.plugin.cfg.reject.literal_mismatch=true;
        this.plugin.literal_mismatch(cb, this.connection, test_helo_classa);
    },
    'fail, reject=false' (test) {
        test.expect(2);
        const outer = this;
        const cb = function () {
            test.equal(undefined, arguments[0]);
            test.ok(outer.connection.results.get('helo.checks').skip.length);
            test.done();
        };
        this.connection.remote.ip='10.0.1.2';
        this.connection.remote.is_private=true;
        this.plugin.init(stub, this.connection, test_helo_classa);
        this.plugin.cfg.check.literal_mismatch=0;
        this.plugin.cfg.reject.literal_mismatch=false;
        this.plugin.literal_mismatch(cb, this.connection, test_helo_classa);
    },
    'fail, reject=true' (test) {
        test.expect(2);
        const outer = this;
        const cb = function () {
            test.equal(undefined, arguments[0]);
            test.ok(outer.connection.results.get('helo.checks').skip.length);
            test.done();
        };
        this.connection.remote.ip='10.0.1.2';
        this.connection.remote.is_private=true;
        this.plugin.init(stub, this.connection, test_helo_classa);
        this.plugin.cfg.check.literal_mismatch=0;
        this.plugin.cfg.reject.literal_mismatch=true;
        this.plugin.literal_mismatch(cb, this.connection, test_helo_classa);
    },
}

exports.valid_hostname = {
    setUp : _set_up,
    'pass' (test) {
        test.expect(2);
        const outer = this;
        const cb = function () {
            // console.log(outer.connection.results.get('helo.checks'));
            test.equal(undefined, arguments[0]);
            test.ok(outer.connection.results.get('helo.checks').pass.length);
            test.done();
        };
        this.plugin.init(stub, this.connection, test_helo_great);
        this.plugin.cfg.check.valid_hostname=true;
        this.plugin.cfg.reject.valid_hostname=true;
        this.plugin.valid_hostname(cb, this.connection, test_helo_great);
    },
    'fail, reject=false' (test) {
        test.expect(2);
        const outer = this;
        const cb = function () {
            // console.log(outer.connection.results.get('helo.checks'));
            test.equal(undefined, arguments[0]);
            test.ok(outer.connection.results.get('helo.checks').fail.length);
            test.done();
        };
        this.plugin.init(stub, this.connection, test_helo_great);
        this.plugin.cfg.check.valid_hostname=true;
        this.plugin.cfg.reject.valid_hostname=false;
        this.plugin.valid_hostname(cb, this.connection, test_helo_great);
    },
    'fail, reject=true' (test) {
        test.expect(2);
        const outer = this;
        const cb = function () {
            // console.log(outer.connection.results.get('helo.checks'));
            test.equal(DENY, arguments[0]);
            test.ok(outer.connection.results.get('helo.checks').fail.length);
            test.done();
        };
        this.plugin.init(stub, this.connection, test_helo_great);
        this.plugin.cfg.check.valid_hostname=true;
        this.plugin.cfg.reject.valid_hostname=true;
        this.plugin.valid_hostname(cb, this.connection, test_helo_great);
    },
}

exports.forward_dns = {
    setUp : _set_up,
    'pass' (test) {
        test.expect(2);
        const outer = this;
        const cb = function () {
            // console.log(arguments);
            // console.log(outer.connection.results.get('helo.checks'));
            test.equal(undefined, arguments[0]);
            test.ok(outer.connection.results.get('helo.checks').pass.length);
            test.done();
        };
        this.connection.remote.ip='4.2.2.2';
        this.plugin.init(stub, this.connection, test_helo_level3);
        this.plugin.cfg.check.forward_dns=true;
        this.plugin.cfg.reject.forward_dns=true;
        this.connection.results.add(this.plugin, {pass: 'valid_hostname'});
        this.plugin.forward_dns(cb, this.connection, test_helo_level3);
    },
    'fail, reject=false' (test) {
        test.expect(2);
        const outer = this;
        const cb = function () {
            // console.log(outer.connection.results.get('helo.checks'));
            test.equal(undefined, arguments[0]);
            test.ok(outer.connection.results.get('helo.checks').fail.length);
            test.done();
        };
        this.connection.remote.ip='66.128.51.163';
        this.plugin.init(stub, this.connection, test_helo_google);
        this.plugin.cfg.check.forward_dns=true;
        this.plugin.cfg.reject.forward_dns=false;
        this.plugin.forward_dns(cb, this.connection, test_helo_google);
    },
    'fail, reject=true' (test) {
        test.expect(2);
        const outer = this;
        const cb = function () {
            // console.log(arguments);
            // console.log(outer.connection.results.get('helo.checks'));
            test.equal(DENY, arguments[0]);
            test.ok(outer.connection.results.get('helo.checks').fail.length);
            test.done();
        };
        this.connection.remote.ip='66.128.51.163';
        this.plugin.init(stub, this.connection, test_helo_google);
        this.plugin.cfg.check.forward_dns=true;
        this.plugin.cfg.reject.forward_dns=true;
        this.plugin.forward_dns(cb, this.connection, test_helo_google);
    },
}

exports.match_re = {
    setUp : _set_up,
    'miss' (test) {
        test.expect(3);
        const cb = function (rc, msg) {
            test.equal(undefined, rc);
            test.equal(undefined, msg);
            test.ok(this.connection.results.get('helo.checks').pass.length);
            test.done();
        }.bind(this);
        this.plugin.init(stub, this.connection, test_helo_not_re);
        this.plugin.cfg.list_re = new RegExp(`^(${['bad.tld'].join('|')})$`, 'i');
        this.plugin.match_re(cb, this.connection, test_helo_not_re);
    },
    'hit, reject=no' (test) {
        test.expect(3);
        const cb = function (rc, msg) {
            test.equal(undefined, rc);
            test.equal(undefined, msg);
            test.ok(this.connection.results.get('helo.checks').fail.length);
            test.done();
        }.bind(this);
        this.plugin.init(stub, this.connection, test_helo_ylmf);
        this.plugin.cfg.reject = { match_re: false };
        this.plugin.cfg.list_re = new RegExp(`^(${['ylmf-pc'].join('|')})$`, 'i');
        this.plugin.match_re(cb, this.connection, test_helo_ylmf);
    },
    'hit, reject=yes, exact' (test) {
        test.expect(3);
        const cb = function (rc, msg) {
            test.equal(DENY, rc);
            test.equal('That HELO not allowed here', msg);
            test.ok(this.connection.results.get('helo.checks').fail.length);
            test.done();
        }.bind(this);
        this.plugin.init(stub, this.connection, test_helo_ylmf);
        this.plugin.cfg.reject = { match_re: true };
        this.plugin.cfg.list_re = new RegExp(`^(${['ylmf-pc'].join('|')})$`, 'i');
        this.plugin.match_re(cb, this.connection, test_helo_ylmf);
    },
    'hit, reject=yes, pattern' (test) {
        test.expect(3);
        const cb = function (rc, msg) {
            test.equal(DENY, rc);
            test.equal('That HELO not allowed here', msg);
            test.ok(this.connection.results.get('helo.checks').fail.length);
            test.done();
        }.bind(this);
        this.plugin.init(stub, this.connection, test_helo_ylmf);
        this.plugin.cfg.reject = { match_re: true };
        this.plugin.cfg.list_re = new RegExp(`^(${['ylm.*'].join('|')})$`, 'i');
        this.plugin.match_re(cb, this.connection, test_helo_ylmf);
    },
}
