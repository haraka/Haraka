
var stub         = require('../fixtures/stub'),
    Plugin       = require('../fixtures/stub_plugin'),
    Connection   = require('../fixtures/stub_connection'),
//  constants    = require('../../constants'),
    Address      = require('../../address'),
    configfile   = require('../../configfile'),
    config       = require('../../config'),
    Header       = require('../../mailheader').Header;
    ResultStore  = require("../../result_store");

// constants.import(global);

function _set_up(callback) {
    this.backup = {};

    // needed for tests
    this.plugin = Plugin('data.headers');
    this.plugin.name = 'data.headers';  // TODO: delete after PR#495 merged

    // stub out functions
    this.connection = Connection.createConnection();
    this.connection.results = new ResultStore(this.connection);
    this.connection.transaction = {
        header: new Header(),
        results: new ResultStore(this.plugin),
    };
    this.connection.notes = {};

    // going to need these in multiple tests
//  this.plugin.register();

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
        var outer = this;
        outer.connection.notes.auth_user = 'test@example.com';
        var next_cb = function() {
            var r = outer.connection.transaction.results.get('data.headers');
            test.equal(true, /^direct-to-mx/.test(r.skip));
            test.equal(false, /^direct-to-mx/.test(r.pass));
            test.equal(false, /^direct-to-mx/.test(r.fail));
        };
        outer.plugin.direct_to_mx(next_cb, outer.connection);
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
        outer.plugin.direct_to_mx(next_cb, outer.connection);
        test.done();
    },
    'received 1': function (test) {
        test.expect(1);
        var outer = this;
        var next_cb = function() {
            var r = outer.connection.transaction.results.get('data.headers');
            test.equal(true, /^direct-to-mx/.test(r.fail));
        };
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
        outer.connection.transaction.mail_from = new Address.Address('<test@example.com>');
        outer.connection.transaction.header.add_end('From', "test@example.com");
        var next_cb = function() {
            var r = outer.connection.transaction.results.get('data.headers');
            test.notEqual(-1, r.pass.indexOf('from_match'));
        };
        outer.plugin.from_match(next_cb, outer.connection);
        test.done();
    },
    'match typical': function (test) {
        test.expect(1);
        var outer = this;
        var next_cb = function() {
            var r = outer.connection.transaction.results.get('data.headers');
            test.notEqual(-1, r.pass.indexOf('from_match'));
        };
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
        this.connection.transaction.mail_from = new Address.Address('<test@example.com>');
        this.connection.transaction.header.add_end('From', "test@example.net");
        this.plugin.from_match(next_cb, this.connection);
        test.done();
    },
};

