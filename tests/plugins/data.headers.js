
var stub         = require('../fixtures/stub'),
    Plugin       = require('../fixtures/stub_plugin'),
    Connection   = require('../fixtures/stub_connection'),
    Address      = require('../../address'),
    configfile   = require('../../configfile'),
    config       = require('../../config'),
    constants    = require('../../constants'),
    Header       = require('../../mailheader').Header,
    ResultStore  = require("../../result_store");

constants.import(global);

function _set_up(callback) {

    this.plugin = Plugin('data.headers');
    this.plugin.config = config;
    this.plugin.register();
    try {
        this.plugin.addrparser = require('address-rfc2822');
    }
    catch (ignore) {}

    // stub out functions
    this.connection = Connection.createConnection();
    this.connection.results = new ResultStore(this.connection);
    this.connection.transaction = {
        header: new Header(),
        results: new ResultStore(this.plugin),
        rcpt_to: [],
    };
    this.connection.notes = {};

    callback();
}

function _tear_down(callback) {
    callback();
}

exports.invalid_date = {
    setUp : _set_up,
    tearDown : _tear_down,
    'none': function (test) {
        test.expect(0);
        test.done();
    },
};

exports.user_agent = {
    setUp : _set_up,
    tearDown : _tear_down,
    'none': function (test) {
        test.expect(2);
        var outer = this;
        var next_cb = function() {
            var r = outer.connection.transaction.results.get('data.headers');
            test.equal(true, /UA/.test(r.fail));
            test.equal(false, /UA/.test(r.pass));
        };
        outer.plugin.cfg.check.user_agent=true;
        outer.plugin.user_agent(next_cb, outer.connection);
        test.done();
    },
    'user-agent': function (test) {
        test.expect(2);
        var outer = this;
        var next_cb = function() {
            var r = outer.connection.transaction.results.get('data.headers');
            test.equal(true, /UA/.test(r.pass));
            test.equal(false, /UA/.test(r.fail));
        };
        outer.plugin.cfg.check.user_agent=true;
        outer.connection.transaction.header.add_end('User-Agent', "Thunderbird");
        outer.plugin.user_agent(next_cb, outer.connection);
        test.done();
    },
    'X-mailer': function (test) {
        test.expect(2);
        var outer = this;
        var next_cb = function() {
            var r = outer.connection.transaction.results.get('data.headers');
            test.equal(true, /UA/.test(r.pass));
            test.equal(false, /UA/.test(r.fail));
        };
        outer.plugin.cfg.check.user_agent=true;
        outer.connection.transaction.header.add_end('X-Mailer', "Apple Mail");
        outer.plugin.user_agent(next_cb, outer.connection);
        test.done();
    },
};

exports.direct_to_mx = {
    setUp : _set_up,
    tearDown : _tear_down,
    'auth user': function (test) {
        test.expect(3);
        this.connection.notes.auth_user = 'test@example.com';
        var outer = this;
        var next_cb = function() {
            var r = outer.connection.transaction.results.get('data.headers');
            test.equal(true, /^direct-to-mx/.test(r.skip));
            test.equal(false, /^direct-to-mx/.test(r.pass));
            test.equal(false, /^direct-to-mx/.test(r.fail));
        };
        this.plugin.cfg.check.direct_to_mx=true;
        this.plugin.direct_to_mx(next_cb, this.connection);
        test.done();
    },
    'received 0': function (test) {
        test.expect(3);
        var outer = this;
        var next_cb = function() {
            var r = outer.connection.transaction.results.get('data.headers');
            test.equal(true, /^direct-to-mx/.test(r.fail));
            test.equal(false, /^direct-to-mx/.test(r.pass));
            test.equal(false, /^direct-to-mx/.test(r.skip));
        };
        this.plugin.cfg.check.direct_to_mx=true;
        this.plugin.direct_to_mx(next_cb, this.connection);
        test.done();
    },
    'received 1': function (test) {
        test.expect(1);
        var outer = this;
        var next_cb = function() {
            var r = outer.connection.transaction.results.get('data.headers');
            test.equal(true, /^direct-to-mx/.test(r.fail));
        };
        this.plugin.cfg.check.direct_to_mx=true;
        this.connection.transaction.header.add_end('Received', 'blah');
        this.plugin.direct_to_mx(next_cb, this.connection);
        test.done();
    },
    'received 2': function (test) {
        test.expect(3);
        var outer = this;
        var next_cb = function() {
            var r = outer.connection.transaction.results.get('data.headers');
            test.equal(true, /^direct-to-mx/.test(r.pass));
            test.equal(false, /^direct-to-mx/.test(r.fail));
            test.equal(false, /^direct-to-mx/.test(r.skip));
        };
        this.plugin.cfg.check.direct_to_mx=true;
        this.connection.transaction.header.add_end('Received', 'blah1');
        this.connection.transaction.header.add_end('Received', 'blah2');
        this.plugin.direct_to_mx(next_cb, this.connection);
        test.done();
    },
};

exports.from_match = {
    setUp : _set_up,
    tearDown : _tear_down,
    'match bare': function (test) {
        test.expect(1);
        var outer = this;
        var next_cb = function() {
            var r = outer.connection.transaction.results.get('data.headers');
            test.notEqual(-1, r.pass.indexOf('from_match'));
        };
        this.plugin.cfg.check.from_match=true;
        this.connection.transaction.mail_from = new Address.Address('<test@example.com>');
        this.connection.transaction.header.add_end('From', "test@example.com");
        this.plugin.from_match(next_cb, this.connection);
        test.done();
    },
    'match typical': function (test) {
        test.expect(1);
        var outer = this;
        var next_cb = function() {
            var r = outer.connection.transaction.results.get('data.headers');
            test.notEqual(-1, r.pass.indexOf('from_match'));
        };
        this.plugin.cfg.check.from_match=true;
        this.connection.transaction.mail_from = new Address.Address('<test@example.com>');
        this.connection.transaction.header.add_end('From', '"Test User" <test@example.com>');
        this.plugin.from_match(next_cb, outer.connection);
        test.done();
    },
    'match unquoted': function (test) {
        test.expect(1);
        var outer = this;
        var next_cb = function() {
            var r = outer.connection.transaction.results.get('data.headers');
            test.notEqual(-1, r.pass.indexOf('from_match'));
        };
        this.plugin.cfg.check.from_match=true;
        this.connection.transaction.mail_from = new Address.Address('<test@example.com>');
        this.connection.transaction.header.add_end('From', 'Test User <test@example.com>');
        this.plugin.from_match(next_cb, this.connection);
        test.done();
    },
    'mismatch': function (test) {
        test.expect(1);
        var outer = this;
        var next_cb = function() {
            var r = outer.connection.transaction.results.get('data.headers');
            test.equal(true, /^from_match/.test(r.fail));
        };
        this.plugin.cfg.check.from_match=true;
        this.connection.transaction.mail_from = new Address.Address('<test@example.com>');
        this.connection.transaction.header.add_end('From', "test@example.net");
        this.plugin.from_match(next_cb, this.connection);
        test.done();
    },
};

exports.mailing_list = {
    setUp : _set_up,
    tearDown : _tear_down,
    'ezmlm true': function (test) {
        test.expect(2);
        var outer = this;
        var next_cb = function() {
            var r = outer.connection.transaction.results.get('data.headers');
            test.equal(true, /ezmlm/.test(r.pass));
            test.equal(0, r.fail.length);
        };
        this.plugin.cfg.check.mailing_list=true;
        this.connection.transaction.header.add_end('Mailing-List', "blah blah: run by ezmlm");
        this.plugin.mailing_list(next_cb, this.connection);
        test.done();
    },
    'ezmlm false': function (test) {
        test.expect(2);
        var outer = this;
        var next_cb = function() {
            var r = outer.connection.transaction.results.get('data.headers');
            test.ok(r.fail.length);
            test.equal(false, /ezmlm/.test(r.pass));
        };
        this.plugin.cfg.check.mailing_list=true;
        this.connection.transaction.header.add_end('Mailing-List', "blah blah random header tokens");
        this.plugin.mailing_list(next_cb, this.connection);
        test.done();
    },
    'yahoogroups': function (test) {
        test.expect(1);
        var outer = this;
        var next_cb = function() {
            var r = outer.connection.transaction.results.get('data.headers');
            test.equal(true, /yahoogroups/.test(r.pass));
        };
        this.plugin.cfg.check.mailing_list=true;
        outer.connection.transaction.header.add_end('Mailing-List', "blah blah such-and-such@yahoogroups.com email list");
        this.plugin.mailing_list(next_cb, this.connection);
        test.done();
    },
    'majordomo': function (test) {
        test.expect(1);
        var outer = this;
        var next_cb = function() {
            var r = outer.connection.transaction.results.get('data.headers');
            test.equal(true, /majordomo/.test(r.pass));
        };
        this.plugin.cfg.check.mailing_list=true;
        outer.connection.transaction.header.add_end('Sender', "owner-blah-blah whatcha");
        outer.plugin.mailing_list(next_cb, outer.connection);
        test.done();
    },
    'mailman': function (test) {
        test.expect(1);
        var outer = this;
        outer.connection.transaction.header.add_end('X-Mailman-Version', "owner-blah-blah whatcha");
        var next_cb = function() {
            var r = outer.connection.transaction.results.get('data.headers');
            test.equal(true, /mailman/.test(r.pass));
        };
        this.plugin.cfg.check.mailing_list=true;
        this.plugin.mailing_list(next_cb, this.connection);
        test.done();
    },
    'majordomo v': function (test) {
        test.expect(1);
        var outer = this;
        var next_cb = function() {
            var r = outer.connection.transaction.results.get('data.headers');
            test.equal(true, /majordomo/.test(r.pass));
        };
        this.plugin.cfg.check.mailing_list=true;
        this.connection.transaction.header.add_end('X-Majordomo-Version', "owner-blah-blah whatcha");
        this.plugin.mailing_list(next_cb, this.connection);
        test.done();
    },
    'google groups': function (test) {
        test.expect(1);
        var outer = this;
        var next_cb = function() {
            var r = outer.connection.transaction.results.get('data.headers');
            test.equal(true, /googlegroups/.test(r.pass));
        };
        this.plugin.cfg.check.mailing_list=true;
        this.connection.transaction.header.add_end('X-Google-Loop', "blah-blah whatcha");
        this.plugin.mailing_list(next_cb, this.connection);
        test.done();
    },
};

exports.delivered_to = {
    setUp : _set_up,
    tearDown : _tear_down,
    'disabled': function (test) {
        test.expect(2);
        var next_cb = function(res, msg) {
            test.equal(undefined, res);
            test.equal(undefined, msg);
            test.done();
        }.bind(this);
        this.plugin.cfg.check.delivered_to=false;
        this.plugin.delivered_to(next_cb, this.connection);
    },
    'header not present': function (test) {
        test.expect(2);
        var next_cb = function(res, msg) {
            test.equal(undefined, res);
            test.equal(undefined, msg);
            test.done();
        }.bind(this);
        this.plugin.cfg.check.delivered_to=true;
        this.plugin.delivered_to(next_cb, this.connection);
    },
    'no recipient match': function (test) {
        test.expect(2);
        var next_cb = function(res, msg) {
            test.equal(undefined, res);
            test.equal(undefined, msg);
            test.done();
        }.bind(this);
        this.plugin.cfg.check.delivered_to=true;
        // this.connection.transaction.mail_from = new Address.Address('<test@example.com>');
        this.connection.transaction.header.add_end('Delivered-To', "user@example.com");
        this.plugin.delivered_to(next_cb, this.connection);
    },
    'recipient match': function (test) {
        test.expect(2);
        var next_cb = function(res, msg) {
            test.equal(DENY, res);
            test.equal('Invalid Delivered-To header content', msg);
            test.done();
        }.bind(this);
        this.plugin.cfg.check.delivered_to=true;
        // this.connection.transaction.mail_from = new Address.Address('<test@example.com>');
        this.connection.transaction.header.add_end('Delivered-To', "user@example.com");
        this.connection.transaction.rcpt_to.push(new Address.Address('user@example.com'));
        this.plugin.delivered_to(next_cb, this.connection);
    },
    'recipient match, reject disabled': function (test) {
        test.expect(2);
        var next_cb = function(res, msg) {
            test.equal(undefined, res);
            test.equal(undefined, msg);
            test.done();
        }.bind(this);
        this.plugin.cfg.check.delivered_to=true;
        this.plugin.cfg.reject.delivered_to=false;
        // this.connection.transaction.mail_from = new Address.Address('<test@example.com>');
        this.connection.transaction.header.add_end('Delivered-To', "user@example.com");
        this.connection.transaction.rcpt_to.push(new Address.Address('user@example.com'));
        this.plugin.delivered_to(next_cb, this.connection);
    },
};
