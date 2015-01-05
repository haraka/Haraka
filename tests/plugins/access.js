'use strict';

var stub         = require('../fixtures/stub');
var Plugin       = require('../fixtures/stub_plugin');
var Connection   = require('../fixtures/stub_connection');
var Address      = require('../../address').Address;
var config       = require('../../config');
var ResultStore  = require('../../result_store');

var _set_up = function (done) {

    this.plugin = new Plugin('access');
    this.plugin.config = config;

    this.connection = Connection.createConnection();
    this.connection.results = new ResultStore(this.connection);
    this.connection.transaction = {
        results: new ResultStore(this.connection),
    };

    done();
};

exports.in_list = {
    setUp : _set_up,
    'white, mail': function (test) {
        var list = {'matt@exam.ple':true,'matt@example.com':true};
        this.plugin.cfg  = { white: { mail: 'test no file' }};
        this.plugin.list = { white: { mail: list }};
        test.expect(3);
        test.equal(true,  this.plugin.in_list('white', 'mail', 'matt@exam.ple'));
        test.equal(true,  this.plugin.in_list('white', 'mail', 'matt@example.com'));
        test.equal(false, this.plugin.in_list('white', 'mail', 'matt@non-exist'));
        test.done();
    },
    'white, rcpt': function (test) {
        var list = {'matt@exam.ple':true,'matt@example.com':true};
        this.plugin.cfg = { re: { white: { rcpt: 'test file name' }}};
        this.plugin.list = { white: { rcpt: list }};
        test.expect(3);
        test.equal(true,  this.plugin.in_list('white', 'rcpt', 'matt@exam.ple'));
        test.equal(true,  this.plugin.in_list('white', 'rcpt', 'matt@example.com'));
        test.equal(false, this.plugin.in_list('white', 'rcpt', 'matt@non-exist'));
        test.done();
    },
    'white, helo': function (test) {
        var list = {'matt@exam.ple':true,'matt@example.com':true};
        this.plugin.cfg = { re: { white: { helo: 'test file name' }}};
        this.plugin.list = { white: { helo: list }};
        test.expect(3);
        test.equal(true,  this.plugin.in_list('white', 'helo', 'matt@exam.ple'));
        test.equal(true,  this.plugin.in_list('white', 'helo', 'matt@example.com'));
        test.equal(false, this.plugin.in_list('white', 'helo', 'matt@non-exist'));
        test.done();
    },
    'black, mail': function (test) {
        var list = {'matt@exam.ple':true,'matt@example.com':true};
        this.plugin.cfg = { re: { black: { mail: 'test file name' }}};
        this.plugin.list = { black: { mail: list }};
        test.expect(3);
        test.equal(true,  this.plugin.in_list('black', 'mail', 'matt@exam.ple'));
        test.equal(true,  this.plugin.in_list('black', 'mail', 'matt@example.com'));
        test.equal(false, this.plugin.in_list('black', 'mail', 'matt@non-exist'));
        test.done();
    },
    'black, rcpt': function (test) {
        var list = {'matt@exam.ple':true,'matt@example.com':true};
        this.plugin.cfg = { re: { black: { rcpt: 'test file name' }}};
        this.plugin.list = { black: { rcpt: list }};
        test.expect(3);
        test.equal(true,  this.plugin.in_list('black', 'rcpt', 'matt@exam.ple'));
        test.equal(true,  this.plugin.in_list('black', 'rcpt', 'matt@example.com'));
        test.equal(false, this.plugin.in_list('black', 'rcpt', 'matt@non-exist'));
        test.done();
    },
    'black, helo': function (test) {
        var list = {'matt@exam.ple':true,'matt@example.com':true};
        this.plugin.cfg = { re: { black: { helo: 'test file name' }}};
        this.plugin.list = { black: { helo: list }};
        test.expect(3);
        test.equal(true,  this.plugin.in_list('black', 'helo', 'matt@exam.ple'));
        test.equal(true,  this.plugin.in_list('black', 'helo', 'matt@example.com'));
        test.equal(false, this.plugin.in_list('black', 'helo', 'matt@non-exist'));
        test.done();
    },
};

exports.in_re_list = {
    setUp : _set_up,
    'white, mail': function (test) {
        var list = ['.*exam.ple','.*example.com'];
        this.plugin.cfg = { re: { white: { mail: 'test file name' }}};
        this.plugin.list_re = { white: { mail: new RegExp('^(' + list.join('|') + ')$', 'i') }};
        test.expect(3);
        test.equal(true,  this.plugin.in_re_list('white', 'mail', 'matt@exam.ple'));
        test.equal(true,  this.plugin.in_re_list('white', 'mail', 'matt@example.com'));
        test.equal(false, this.plugin.in_re_list('white', 'mail', 'matt@non-exist'));
        test.done();
    },
    'white, rcpt': function (test) {
        var list = ['.*exam.ple','.*example.com'];
        this.plugin.cfg = { re: { white: { rcpt: 'test file name' }}};
        this.plugin.list_re = { white: { rcpt: new RegExp('^(' + list.join('|') + ')$', 'i') }};
        test.expect(3);
        test.equal(true,  this.plugin.in_re_list('white', 'rcpt', 'matt@exam.ple'));
        test.equal(true,  this.plugin.in_re_list('white', 'rcpt', 'matt@example.com'));
        test.equal(false, this.plugin.in_re_list('white', 'rcpt', 'matt@non-exist'));
        test.done();
    },
    'white, helo': function (test) {
        var list = ['.*exam.ple','.*example.com'];
        this.plugin.cfg = { re: { white: { helo: 'test file name' }}};
        this.plugin.list_re = { white: { helo: new RegExp('^(' + list.join('|') + ')$', 'i') }};
        test.expect(3);
        test.equal(true,  this.plugin.in_re_list('white', 'helo', 'matt@exam.ple'));
        test.equal(true,  this.plugin.in_re_list('white', 'helo', 'matt@example.com'));
        test.equal(false, this.plugin.in_re_list('white', 'helo', 'matt@non-exist'));
        test.done();
    },
    'black, mail': function (test) {
        var list = ['.*exam.ple','.*example.com'];
        this.plugin.cfg = { re: { black: { mail: 'test file name' }}};
        this.plugin.list_re = { black: { mail: new RegExp('^(' + list.join('|') + ')$', 'i') }};
        test.expect(3);
        test.equal(true,  this.plugin.in_re_list('black', 'mail', 'matt@exam.ple'));
        test.equal(true,  this.plugin.in_re_list('black', 'mail', 'matt@example.com'));
        test.equal(false, this.plugin.in_re_list('black', 'mail', 'matt@non-exist'));
        test.done();
    },
    'black, rcpt': function (test) {
        var list = ['.*exam.ple','.*example.com'];
        this.plugin.cfg = { re: { black: { rcpt: 'test file name' }}};
        this.plugin.list_re = { black: { rcpt: new RegExp('^(' + list.join('|') + ')$', 'i') }};
        test.expect(3);
        test.equal(true,  this.plugin.in_re_list('black', 'rcpt', 'matt@exam.ple'));
        test.equal(true,  this.plugin.in_re_list('black', 'rcpt', 'matt@example.com'));
        test.equal(false, this.plugin.in_re_list('black', 'rcpt', 'matt@non-exist'));
        test.done();
    },
    'black, helo': function (test) {
        var list = ['.*exam.ple','.*example.com'];
        this.plugin.cfg = { re: { black: { helo: 'test file name' }}};
        this.plugin.list_re = { black: { helo: new RegExp('^(' + list.join('|') + ')$', 'i') }};
        test.expect(3);
        test.equal(true,  this.plugin.in_re_list('black', 'helo', 'matt@exam.ple'));
        test.equal(true,  this.plugin.in_re_list('black', 'helo', 'matt@example.com'));
        test.equal(false, this.plugin.in_re_list('black', 'helo', 'matt@non-exist'));
        test.done();
    },
};

exports.load_re_file = {
    setUp : _set_up,
    'whitelist': function (test) {
        test.expect(3);
        this.plugin.init_config();
        this.plugin.load_re_file('white', 'mail');
        test.ok(this.plugin.list_re);
        // console.log(this.plugin.temp);
        test.equal(true,  this.plugin.in_re_list('white', 'mail', 'list@harakamail.com'));
        test.equal(false, this.plugin.in_re_list('white', 'mail', 'list@harail.com'));
        test.done();
    },
};

exports.in_file = {
    setUp : _set_up,
    'in_file': function (test) {
        test.expect(2);
        var file = 'mail_from.access.whitelist';
        test.equal(true,  this.plugin.in_file(file, 'haraka@harakamail.com', this.connection));
        test.equal(false, this.plugin.in_file(file, 'matt@harakamail.com', this.connection));
        test.done();
    },
};

exports.in_re_file = {
    setUp : _set_up,
    'in_re_file': function (test) {
        test.expect(2);
        var file = 'mail_from.access.whitelist_regex';
        test.equal(true,  this.plugin.in_re_file(file, 'list@harakamail.com'));
        test.equal(false, this.plugin.in_re_file(file, 'matt@harkatamale.com'));
        test.done();
    },
};

exports.rdns_access = {
    setUp : _set_up,
    'no list': function (test) {
        test.expect(2);
        this.plugin.init_config();
        this.plugin.init_lists();
        var cb = function (rc) {
            // console.log(this.connection.results);
            test.equal(undefined, rc);
            test.ok(this.connection.results.get('access').pass.length);
            test.done();
        }.bind(this);
        this.connection.remote_ip='1.1.1.1';
        this.connection.remote_host='host.example.com';
        this.plugin.rdns_access(cb, this.connection);
    },
    'whitelist': function (test) {
        test.expect(2);
        this.plugin.init_config();
        this.plugin.init_lists();
        var cb = function (rc) {
            // console.log(this.connection.results.get('access'));
            test.equal(undefined, rc);
            test.ok(this.connection.results.get('access').pass.length);
            // test.ok(this.connection.results.has('access', 'pass', /white/));
            test.done();
        }.bind(this);
        this.connection.remote_ip='1.1.1.1';
        this.connection.remote_host='host.example.com';
        this.plugin.list.white.conn['host.example.com']=true;
        this.plugin.rdns_access(cb, this.connection);
    },
    'blacklist': function (test) {
        test.expect(3);
        this.plugin.init_config();
        this.plugin.init_lists();
        var cb = function (rc, msg) {
            // console.log(this.connection.results.get('access'));
            test.equal(DENYDISCONNECT, rc);
            test.equal("host.example.com [1.1.1.1] You are not allowed to connect", msg);
            test.ok(this.connection.results.get('access').fail.length);
            test.done();
        }.bind(this);
        this.connection.remote_ip='1.1.1.1';
        this.connection.remote_host='host.example.com';
        this.plugin.list.black.conn['host.example.com']=true;
        this.plugin.rdns_access(cb, this.connection);
    },
    'blacklist regex': function (test) {
        test.expect(3);
        this.plugin.init_config();
        this.plugin.init_lists();
        var cb = function (rc, msg) {
            // console.log(this.connection.results.get('access'));
            test.equal(DENYDISCONNECT, rc);
            test.equal("host.antispam.com [1.1.1.1] You are not allowed to connect", msg);
            test.ok(this.connection.results.get('access').fail.length);
            test.done();
        }.bind(this);
        this.connection.remote_ip='1.1.1.1';
        this.connection.remote_host='host.antispam.com';
        var black = [ '.*spam.com' ];
        this.plugin.list_re.black.conn = new RegExp('^(' + black.join('|') + ')$', 'i');
        this.plugin.rdns_access(cb, this.connection);
    },
};

exports.helo_access = {
    setUp : _set_up,
    'no list': function (test) {
        test.expect(2);
        this.plugin.init_config();
        this.plugin.init_lists();
        var cb = function (rc) {
            var r = this.connection.results.get('access');
            test.equal(undefined, rc);
            test.ok(r && r.pass && r.pass.length);
            test.done();
        }.bind(this);
        this.plugin.cfg.check.helo=true;
        this.plugin.helo_access(cb, this.connection, 'host.example.com');
    },
    'blacklisted regex': function (test) {
        test.expect(2);
        this.plugin.init_config();
        this.plugin.init_lists();
        var cb = function (rc) {
            test.equal(DENY, rc);
            var r = this.connection.results.get('access');
            test.ok(r && r.fail && r.fail.length);
            test.done();
        }.bind(this);
        var black = [ '.*spam.com' ];
        this.plugin.list_re.black.helo =
            new RegExp('^(' + black.join('|') + ')$', 'i');
        this.plugin.cfg.check.helo=true;
        this.plugin.helo_access(cb, this.connection, 'bad.spam.com');
    },
};

exports.mail_from_access = {
    setUp : _set_up,
    'no lists populated': function (test) {
        test.expect(2);
        this.plugin.init_config();
        this.plugin.init_lists();
        var cb = function (rc) {
            test.equal(undefined, rc);
            test.ok(this.connection.transaction.results.get('access').pass.length);
            test.done();
        }.bind(this);
        this.plugin.mail_from_access(cb, this.connection, [new Address('<list@unknown.com>')]);
    },
    'whitelisted addr': function (test) {
        test.expect(2);
        this.plugin.init_config();
        this.plugin.init_lists();
        var cb = function (rc) {
            test.equal(undefined, rc);
            test.ok(this.connection.transaction.results.get('access').pass.length);
            test.done();
        }.bind(this);
        this.plugin.list.white.mail['list@harakamail.com']=true;
        this.plugin.mail_from_access(cb, this.connection, [new Address('<list@harakamail.com>')]);
    },
    'blacklisted addr': function (test) {
        test.expect(2);
        this.plugin.init_config();
        this.plugin.init_lists();
        var cb = function (rc) {
            test.equal(DENY, rc);
            test.ok(this.connection.transaction.results.get('access').fail.length);
            test.done();
        }.bind(this);
        this.plugin.list.black.mail['list@badmail.com']=true;
        this.plugin.mail_from_access(cb, this.connection, [new Address('<list@badmail.com>')]);
    },
    'blacklisted domain': function (test) {
        test.expect(2);
        this.plugin.init_config();
        this.plugin.init_lists();
        var cb = function (rc) {
            test.equal(DENY, rc);
            test.ok(this.connection.transaction.results.get('access').fail.length);
            test.done();
        }.bind(this);
        var black = [ '.*@spam.com' ];
        this.plugin.list_re.black.mail = new RegExp('^(' + black.join('|') + ')$', 'i');
        this.plugin.mail_from_access(cb, this.connection, [new Address('<bad@spam.com>')]);
    },
    'blacklisted domain, white addr': function (test) {
        test.expect(2);
        this.plugin.init_config();
        this.plugin.init_lists();
        var cb = function (rc) {
            test.equal(undefined, rc);
            test.ok(this.connection.transaction.results.get('access').pass.length);
            test.done();
        }.bind(this);
        this.plugin.list.white.mail['special@spam.com']=true;
        var black = [ '.*@spam.com' ];
        this.plugin.list_re.black.mail = new RegExp('^(' + black.join('|') + ')$', 'i');
        this.plugin.mail_from_access(cb, this.connection, [new Address('<special@spam.com>')]);
    },
};

exports.rcpt_to_access = {
    setUp : _set_up,
    'no lists populated': function (test) {
        test.expect(2);
        this.plugin.init_config();
        this.plugin.init_lists();
        var cb = function (rc) {
            test.equal(undefined, rc);
            test.ok(this.connection.transaction.results.get('access').pass.length);
            test.done();
        }.bind(this);
        this.plugin.rcpt_to_access(cb, this.connection, [new Address('<user@example.com>')]);
    },
    'whitelisted addr': function (test) {
        test.expect(2);
        this.plugin.init_config();
        this.plugin.init_lists();
        var cb = function (rc) {
            test.equal(undefined, rc);
            test.ok(this.connection.transaction.results.get('access').pass.length);
            test.done();
        }.bind(this);
        this.plugin.list.white.rcpt['user@example.com']=true;
        this.plugin.rcpt_to_access(cb, this.connection, [new Address('<user@example.com>')]);
    },
    'blacklisted addr': function (test) {
        test.expect(2);
        this.plugin.init_config();
        this.plugin.init_lists();
        var cb = function (rc) {
            test.equal(DENY, rc);
            test.ok(this.connection.transaction.results.get('access').fail.length);
            test.done();
        }.bind(this);
        this.plugin.list.black.rcpt['user@badmail.com']=true;
        this.plugin.rcpt_to_access(cb, this.connection, [new Address('<user@badmail.com>')]);
    },
    'blacklisted domain': function (test) {
        test.expect(2);
        this.plugin.init_config();
        this.plugin.init_lists();
        var cb = function (rc) {
            test.equal(DENY, rc);
            test.ok(this.connection.transaction.results.get('access').fail.length);
            test.done();
        }.bind(this);
        var black = [ '.*@spam.com' ];
        this.plugin.list_re.black.rcpt = new RegExp('^(' + black.join('|') + ')$', 'i');
        this.plugin.rcpt_to_access(cb, this.connection, [new Address('<bad@spam.com>')]);
    },
    'blacklisted domain, white addr': function (test) {
        test.expect(2);
        this.plugin.init_config();
        this.plugin.init_lists();
        var cb = function (rc) {
            test.equal(undefined, rc);
            test.ok(this.connection.transaction.results.get('access').pass.length);
            test.done();
        }.bind(this);
        this.plugin.list.white.rcpt['special@spam.com'] = true;
        var black = [ '.*@spam.com' ];
        this.plugin.list_re.black.rcpt = new RegExp('^(' + black.join('|') + ')$', 'i');
        this.plugin.rcpt_to_access(cb, this.connection, [new Address('<special@spam.com>')]);
    },
};
