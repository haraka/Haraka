'use strict';

var stub         = require('../fixtures/stub');
var Plugin       = require('../fixtures/stub_plugin');
var Connection   = require('../fixtures/stub_connection');
var config       = require('../../config');
var Address      = require('../../address');

var _set_up = function (done) {
    
    this.plugin = new Plugin('helo.checks');
    this.plugin.config = config;

    this.connection = Connection.createConnection();

    this.connection.remote_ip='208.75.199.19';

    this.plugin.register();

    done();
};

exports.init = {
    setUp: _set_up,
    'ensure init is always run': function (test) {
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
    'host_mismatch, reject=false' : function (test) {
        test.expect(2);
        var outer = this;
        var cb = function () {
            test.equal(undefined, arguments[0]);
            // console.log(outer.connection.results.get('helo.checks'));
            test.ok(outer.connection.results.get('helo.checks').fail.length);
        };
        this.plugin.init(stub, this.connection, 'helo.example.com');
        this.plugin.cfg.check.mismatch=true;
        this.plugin.cfg.reject.mismatch=false;
        this.plugin.host_mismatch(cb, this.connection, 'anything');
        test.done();
    },
    'host_mismatch, reject=true' : function (test) {
        test.expect(2);
        var outer = this;
        var cb = function () {
            test.equal(DENY, arguments[0]);
            // console.log(outer.connection.results.get('helo.checks'));
            test.ok(outer.connection.results.get('helo.checks').fail.length);
        };
        this.plugin.init(stub, this.connection, 'helo.example.com');
        this.plugin.cfg.check.mismatch=true;
        this.plugin.cfg.reject.mismatch=true;
        this.plugin.host_mismatch(cb, this.connection, 'anything');
        test.done();
    },
};

exports.proto_mismatch = {
    setUp : _set_up,
    'proto_mismatch, reject=false, esmtp=false' : function (test) {
        test.expect(2);
        var outer = this;
        var cb = function () {
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
    'proto_mismatch, reject=false, esmtp=true' : function (test) {
        test.expect(2);
        var outer = this;
        var cb = function () {
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
    'proto_mismatch, reject=true' : function (test) {
        test.expect(2);
        var outer = this;
        var cb = function () {
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
};

exports.rdns_match = {
    setUp : _set_up,
    'pass' : function (test) {
        test.expect(2);
        var outer = this;
        var cb = function () {
            test.equal(undefined, arguments[0]);
            test.ok(outer.connection.results.get('helo.checks').pass.length);
        };
        this.plugin.init(stub, this.connection, 'helo.example.com');
        this.connection.remote_host='helo.example.com';
        this.plugin.cfg.check.rdns_match=true;
        this.plugin.cfg.reject.rdns_match=true;
        this.plugin.rdns_match(cb, this.connection, 'helo.example.com');
        test.done();
    },
    'pass (org dom match)' : function (test) {
        test.expect(2);
        var outer = this;
        var cb = function () {
            test.equal(undefined, arguments[0]);
            // console.log(outer.connection.results.get('helo.checks'));
            test.ok(outer.connection.results.get('helo.checks').pass.length);
        };
        this.plugin.init(stub, this.connection, 'helo.example.com');
        this.connection.remote_host='ehlo.example.com';
        this.plugin.cfg.check.rdns_match=true;
        this.plugin.cfg.reject.rdns_match=false;
        this.plugin.rdns_match(cb, this.connection, 'helo.example.com');
        test.done();
    },
    'fail' : function (test) {
        test.expect(2);
        var outer = this;
        var cb = function () {
            test.equal(undefined, arguments[0]);
            // console.log(outer.connection.results.get('helo.checks'));
            test.ok(outer.connection.results.get('helo.checks').fail.length);
        };
        this.plugin.init(stub, this.connection, 'helo.example.com');
        this.connection.remote_host='ehlo.gmail.com';
        this.plugin.cfg.check.rdns_match=true;
        this.plugin.cfg.reject.rdns_match=false;
        this.plugin.rdns_match(cb, this.connection, 'helo.example.com');
        test.done();
    },
    'fail, reject' : function (test) {
        test.expect(2);
        var outer = this;
        var cb = function () {
            test.equal(DENY, arguments[0]);
            // console.log(outer.connection.results.get('helo.checks'));
            test.ok(outer.connection.results.get('helo.checks').fail.length);
        };
        this.plugin.init(stub, this.connection, 'helo.example.com');
        this.connection.remote_host='ehlo.gmail.com';
        this.plugin.cfg.check.rdns_match=true;
        this.plugin.cfg.reject.rdns_match=true;
        this.plugin.rdns_match(cb, this.connection, 'helo.example.com');
        test.done();
    },
};

exports.bare_ip = {
    setUp : _set_up,
    'pass' : function (test) {
        test.expect(2);
        var outer = this;
        var cb = function () {
            test.equal(undefined, arguments[0]);
            test.ok(outer.connection.results.get('helo.checks').pass.length);
        };
        this.plugin.init(stub, this.connection, '[192.168.1.2]');
        this.plugin.cfg.check.bare_ip=true;
        this.plugin.cfg.reject.bare_ip=true;
        this.plugin.bare_ip(cb, this.connection, '[192.168.1.2]');
        test.done();
    },
    'fail' : function (test) {
        test.expect(2);
        var outer = this;
        var cb = function () {
            test.equal(undefined, arguments[0]);
            test.ok(outer.connection.results.get('helo.checks').fail.length);
        };
        this.plugin.init(stub, this.connection, '192.168.1.1');
        this.plugin.cfg.check.bare_ip=true;
        this.plugin.cfg.reject.bare_ip=false;
        this.plugin.bare_ip(cb, this.connection, '192.168.1.1');
        test.done();
    },
    'fail, reject' : function (test) {
        test.expect(2);
        var outer = this;
        var cb = function () {
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
};

exports.dynamic = {
    setUp : _set_up,
    'pass' : function (test) {
        test.expect(2);
        var outer = this;
        var test_helo = 'matt.simerson.tld';
        var cb = function () {
            test.equal(undefined, arguments[0]);
            test.ok(outer.connection.results.get('helo.checks').pass.length);
        };
        this.connection.remote_ip='208.75.177.99';
        this.plugin.init(stub, this.connection, test_helo);
        this.plugin.cfg.check.dynamic=true;
        this.plugin.cfg.reject.dynamic=true;
        this.plugin.dynamic(cb, this.connection, test_helo);
        test.done();
    },
    'fail' : function (test) {
        test.expect(2);
        var outer = this;
        var test_helo = 'c-76-121-96-159.hsd1.wa.comcast.net';
        var cb = function () {
            test.equal(undefined, arguments[0]);
            // console.log(outer.connection.results.get('helo.checks'));
            test.ok(outer.connection.results.get('helo.checks').fail.length);
        };
        this.connection.remote_ip='76.121.96.159';
        this.plugin.init(stub, this.connection, test_helo);
        this.plugin.cfg.check.dynamic=true;
        this.plugin.cfg.reject.dynamic=false;
        this.plugin.dynamic(cb, this.connection, test_helo);
        test.done();
    },
    'fail, reject' : function (test) {
        test.expect(2);
        var outer = this;
        var test_helo = 'c-76-121-96-159.hsd1.wa.comcast.net';
        var cb = function () {
            test.equal(DENY, arguments[0]);
            // console.log(outer.connection.results.get('helo.checks'));
            test.ok(outer.connection.results.get('helo.checks').fail.length);
        };
        this.connection.remote_ip='76.121.96.159';
        this.plugin.init(stub, this.connection, test_helo);
        this.plugin.cfg.check.dynamic=true;
        this.plugin.cfg.reject.dynamic=true;
        this.plugin.dynamic(cb, this.connection, test_helo);
        test.done();
    },
};

exports.big_company = {
    setUp : _set_up,
    'pass, reject=false' : function (test) {
        test.expect(2);
        var outer = this;
        var test_helo = 'yahoo.com';
        var cb = function () {
            test.equal(undefined, arguments[0]);
            test.ok(outer.connection.results.get('helo.checks').pass.length);
            test.done();
        };
        this.connection.remote_host='yahoo.com';
        this.plugin.init(stub, this.connection, test_helo);
        this.plugin.cfg.check.big_company=true;
        this.plugin.cfg.reject.big_company=true;
        this.plugin.big_company(cb, this.connection, test_helo);
    },
    'fail, reject=false' : function (test) {
        test.expect(2);
        var outer = this;
        var test_helo = 'yahoo.com';
        var cb = function () {
            test.equal(undefined, arguments[0]);
            test.ok(outer.connection.results.get('helo.checks').fail.length);
            test.done();
        };
        this.connection.remote_host='anything-else.com';
        this.plugin.init(stub, this.connection, test_helo);
        this.plugin.cfg.check.big_company=true;
        this.plugin.cfg.reject.big_company=false;
        this.plugin.big_company(cb, this.connection, test_helo);
    },
    'fail, reject=true' : function (test) {
        test.expect(2);
        var outer = this;
        var test_helo = 'yahoo.com';
        var cb = function () {
            test.equal(DENY, arguments[0]);
            test.ok(outer.connection.results.get('helo.checks').fail.length);
            test.done();
        };
        this.connection.remote_host='anything-else.com';
        this.plugin.init(stub, this.connection, test_helo);
        this.plugin.cfg.check.big_company=true;
        this.plugin.cfg.reject.big_company=true;
        this.plugin.big_company(cb, this.connection, test_helo);
    },
};

exports.literal_mismatch = {
    setUp : _set_up,
    'pass' : function (test) {
        test.expect(2);
        var outer = this;
        var test_helo = '[10.0.1.1]';
        var cb = function () {
            // console.log(outer.connection.results.get('helo.checks'));
            test.equal(undefined, arguments[0]);
            test.ok(outer.connection.results.get('helo.checks').skip.length);
            test.done();
        };
        this.connection.remote_ip='10.0.1.1';
        this.plugin.init(stub, this.connection, test_helo);
        this.plugin.cfg.check.literal_mismatch=1;
        this.plugin.cfg.reject.literal_mismatch=true;
        this.plugin.literal_mismatch(cb, this.connection, test_helo);
    },
    'pass, network' : function (test) {
        test.expect(2);
        var outer = this;
        var test_helo = '[10.0.1.1]';
        var cb = function () {
            // console.log(outer.connection.results.get('helo.checks'));
            test.equal(undefined, arguments[0]);
            test.ok(outer.connection.results.get('helo.checks').skip.length);
            test.done();
        };
        this.connection.remote_ip='10.0.1.2';
        this.plugin.init(stub, this.connection, test_helo);
        this.plugin.cfg.check.literal_mismatch=2;
        this.plugin.cfg.reject.literal_mismatch=true;
        this.plugin.literal_mismatch(cb, this.connection, test_helo);
    },
    'fail, reject=false' : function (test) {
        test.expect(2);
        var outer = this;
        var test_helo = '[10.0.1.1]';
        var cb = function () {
            // console.log(outer.connection.results.get('helo.checks'));
            test.equal(undefined, arguments[0]);
            test.ok(outer.connection.results.get('helo.checks').skip.length);
            test.done();
        };
        this.connection.remote_ip='10.0.1.2';
        this.plugin.init(stub, this.connection, test_helo);
        this.plugin.cfg.check.literal_mismatch=0;
        this.plugin.cfg.reject.literal_mismatch=false;
        this.plugin.literal_mismatch(cb, this.connection, test_helo);
    },
    'fail, reject=true' : function (test) {
        test.expect(2);
        var outer = this;
        var test_helo = '[10.0.1.1]';
        var cb = function () {
            // console.log(outer.connection.results.get('helo.checks'));
            test.equal(undefined, arguments[0]);
            test.ok(outer.connection.results.get('helo.checks').skip.length);
            test.done();
        };
        this.connection.remote_ip='10.0.1.2';
        this.plugin.init(stub, this.connection, test_helo);
        this.plugin.cfg.check.literal_mismatch=0;
        this.plugin.cfg.reject.literal_mismatch=true;
        this.plugin.literal_mismatch(cb, this.connection, test_helo);
    },
};

exports.valid_hostname = {
    setUp : _set_up,
    'pass' : function (test) {
        test.expect(2);
        var test_helo = 'great.domain.com';
        var outer = this;
        var cb = function () {
            // console.log(outer.connection.results.get('helo.checks'));
            test.equal(undefined, arguments[0]);
            test.ok(outer.connection.results.get('helo.checks').pass.length);
            test.done();
        };
        this.plugin.init(stub, this.connection, test_helo);
        this.plugin.cfg.check.valid_hostname=true;
        this.plugin.cfg.reject.valid_hostname=true;
        this.plugin.valid_hostname(cb, this.connection, test_helo);
    },
    'fail, reject=false' : function (test) {
        test.expect(2);
        var test_helo = 'great.domain.non-existent-tld';
        var outer = this;
        var cb = function () {
            // console.log(outer.connection.results.get('helo.checks'));
            test.equal(undefined, arguments[0]);
            test.ok(outer.connection.results.get('helo.checks').fail.length);
            test.done();
        };
        this.plugin.init(stub, this.connection, test_helo);
        this.plugin.cfg.check.valid_hostname=true;
        this.plugin.cfg.reject.valid_hostname=false;
        this.plugin.valid_hostname(cb, this.connection, test_helo);
    },
    'fail, reject=true' : function (test) {
        test.expect(2);
        var test_helo = 'great.domain.non-existent-tld';
        var outer = this;
        var cb = function () {
            // console.log(outer.connection.results.get('helo.checks'));
            test.equal(DENY, arguments[0]);
            test.ok(outer.connection.results.get('helo.checks').fail.length);
            test.done();
        };
        this.plugin.init(stub, this.connection, test_helo);
        this.plugin.cfg.check.valid_hostname=true;
        this.plugin.cfg.reject.valid_hostname=true;
        this.plugin.valid_hostname(cb, this.connection, test_helo);
    },
};

exports.forward_dns = {
    setUp : _set_up,
    'pass' : function (test) {
        test.expect(2);
        var outer = this;
        var test_helo = 'b.resolvers.level3.net';
        var cb = function () {
            // console.log(arguments);
            // console.log(outer.connection.results.get('helo.checks'));
            test.equal(undefined, arguments[0]);
            test.ok(outer.connection.results.get('helo.checks').pass.length);
            test.done();
        };
        this.connection.remote_ip='4.2.2.2';
        this.plugin.init(stub, this.connection, test_helo);
        this.plugin.cfg.check.forward_dns=true;
        this.plugin.cfg.reject.forward_dns=true;
        this.connection.results.add(this.plugin, {pass: 'valid_hostname'});
        this.plugin.forward_dns(cb, this.connection, test_helo);
    },
    'fail, reject=false' : function (test) {
        test.expect(2);
        var outer = this;
        var test_helo = 'www.google.com';
        var cb = function () {
            // console.log(outer.connection.results.get('helo.checks'));
            test.equal(undefined, arguments[0]);
            test.ok(outer.connection.results.get('helo.checks').fail.length);
            test.done();
        };
        this.connection.remote_ip='66.128.51.163';
        this.plugin.init(stub, this.connection, test_helo);
        this.plugin.cfg.check.forward_dns=true;
        this.plugin.cfg.reject.forward_dns=false;
        this.plugin.forward_dns(cb, this.connection, test_helo);
    },
    'fail, reject=true' : function (test) {
        test.expect(2);
        var outer = this;
        var test_helo = 'www.google.com';
        var cb = function () {
            // console.log(arguments);
            // console.log(outer.connection.results.get('helo.checks'));
            test.equal(DENY, arguments[0]);
            test.ok(outer.connection.results.get('helo.checks').fail.length);
            test.done();
        };
        this.connection.remote_ip='66.128.51.163';
        this.plugin.init(stub, this.connection, test_helo);
        this.plugin.cfg.check.forward_dns=true;
        this.plugin.cfg.reject.forward_dns=true;
        this.plugin.forward_dns(cb, this.connection, test_helo);
    },
};

exports.match_re = {
    setUp : _set_up,
    'miss' : function (test) {
        test.expect(3);
        var test_helo = 'not_in_re_list.net';
        var cb = function (rc, msg) {
            test.equal(undefined, rc);
            test.equal(undefined, msg);
            test.ok(this.connection.results.get('helo.checks').pass.length);
            test.done();
        }.bind(this);
        this.plugin.init(stub, this.connection, test_helo);
        this.plugin.cfg.list_re = new RegExp('^(' + ['bad.tld'].join('|') + ')$', 'i');
        this.plugin.match_re(cb, this.connection, test_helo);
    },
    'hit, reject=no' : function (test) {
        test.expect(3);
        var test_helo = 'ylmf-pc';
        var cb = function (rc, msg) {
            test.equal(undefined, rc);
            test.equal(undefined, msg);
            test.ok(this.connection.results.get('helo.checks').fail.length);
            test.done();
        }.bind(this);
        this.plugin.init(stub, this.connection, test_helo);
        this.plugin.cfg.reject = { match_re: false };
        this.plugin.cfg.list_re = new RegExp('^(' + ['ylmf-pc'].join('|') + ')$', 'i');
        this.plugin.match_re(cb, this.connection, test_helo);
    },
    'hit, reject=yes, exact' : function (test) {
        test.expect(3);
        var test_helo = 'ylmf-pc';
        var cb = function (rc, msg) {
            test.equal(DENY, rc);
            test.equal('That HELO not allowed here', msg);
            test.ok(this.connection.results.get('helo.checks').fail.length);
            test.done();
        }.bind(this);
        this.plugin.init(stub, this.connection, test_helo);
        this.plugin.cfg.reject = { match_re: true };
        this.plugin.cfg.list_re = new RegExp('^(' + ['ylmf-pc'].join('|') + ')$', 'i');
        this.plugin.match_re(cb, this.connection, test_helo);
    },
    'hit, reject=yes, pattern' : function (test) {
        test.expect(3);
        var test_helo = 'ylmf-pc';
        var cb = function (rc, msg) {
            test.equal(DENY, rc);
            test.equal('That HELO not allowed here', msg);
            test.ok(this.connection.results.get('helo.checks').fail.length);
            test.done();
        }.bind(this);
        this.plugin.init(stub, this.connection, test_helo);
        this.plugin.cfg.reject = { match_re: true };
        this.plugin.cfg.list_re = new RegExp('^(' + ['ylm.*'].join('|') + ')$', 'i');
        this.plugin.match_re(cb, this.connection, test_helo);
    },
};
