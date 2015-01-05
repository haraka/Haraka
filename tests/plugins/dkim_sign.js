'use strict';

var Plugin       = require('../fixtures/stub_plugin');
var Connection   = require('../fixtures/stub_connection');
var config       = require('../../config');
var Address      = require('../../address');
var Header       = require('../../mailheader').Header;
var utils        = require('../../utils');

var _set_up = function (done) {

    this.plugin = new Plugin('dkim_sign');
    this.plugin.config = config;
    this.plugin.cfg = { main: { } };

    this.connection = Connection.createConnection();
    this.connection.transaction = {
        header: new Header(),
    };

    done();
};

exports.get_sender_domain = {
    setUp : _set_up,
    'no transaction': function (test) {
        test.expect(1);
        delete this.connection.transaction;
        var r = this.plugin.get_sender_domain(this.connection.transaction);
        test.equal(undefined, r);
        test.done();
    },
    'no headers': function (test) {
        test.expect(1);
        var r = this.plugin.get_sender_domain(this.connection.transaction);
        test.equal(undefined, r);
        test.done();
    },
    'no from header': function (test) {
        test.expect(1);
        this.connection.transaction.header.add('Date', utils.date_to_str(new Date()));
        var r = this.plugin.get_sender_domain(this.connection.transaction);
        test.equal(undefined, r);
        test.done();
    },
    'no from header, env MAIL FROM': function (test) {
        test.expect(1);
        this.connection.transaction.mail_from = new Address.Address('<test@example.com>');
        var r = this.plugin.get_sender_domain(this.connection.transaction);
        test.equal('example.com', r);
        test.done();
    },
    'from header, simple': function (test) {
        test.expect(1);
        this.connection.transaction.header.add('From', 'John Doe <jdoe@example.com>');
        var r = this.plugin.get_sender_domain(this.connection.transaction);
        test.equal('example.com', r);
        test.done();
    },
    'from header, less simple': function (test) {
        test.expect(1);
        this.connection.transaction.header.add('From', '"Joe Q. Public" <john.q.public@example.com>');
        var r = this.plugin.get_sender_domain(this.connection.transaction);
        test.equal('example.com', r);
        test.done();
    },
    'from header, RFC 5322 odd': function (test) {
        test.expect(1);
        this.connection.transaction.header.add('From', 'Pete(A nice \) chap) <pete(his account)@silly.test(his host)>');
        var r = this.plugin.get_sender_domain(this.connection.transaction);
        test.equal('silly.test', r);
        test.done();
    },
    'from header group': function (test) {
        test.expect(1);
        this.connection.transaction.header.add('From', 'ben@example.com,carol@example.com');
        this.connection.transaction.header.add('Sender', 'dave@example.net');
        var r = this.plugin.get_sender_domain(this.connection.transaction);
        test.equal('example.net', r);
        test.done();
    },
    'from header group, RFC 6854': function (test) {
        test.expect(1);
        // TODO: this test passes, but the parsing isn't correct. The From
        // addr parser doesn't support the RFC 6854 Group Syntax
        this.connection.transaction.header.add('From', 'Managing Partners:ben@example.com,carol@example.com;');
        this.connection.transaction.header.add('Sender', 'dave@example.net');
        var r = this.plugin.get_sender_domain(this.connection.transaction);
        test.equal('example.net', r);
        test.done();
    },
};

exports.get_key_dir = {
    setUp : _set_up,
    'no transaction': function (test) {
        test.expect(1);
        var cb = function (dir) {
            test.equal(undefined, dir);
            test.done();
        };
        this.plugin.get_key_dir(this.connection, cb);
    },
    'no key dir': function (test) {
        test.expect(1);
        var cb = function (dir) {
            test.equal(undefined, dir);
            test.done();
        };
        this.connection.transaction = {
            mail_from: new Address.Address('<matt@example.com>'),
        };
        this.plugin.get_key_dir(this.connection, cb);
    },
};

exports.get_headers_to_sign = {
    setUp : _set_up,
    'none': function (test) {
        test.expect(1);
        var r = this.plugin.get_headers_to_sign(this.plugin.cfg);
        test.deepEqual(r, []);
        test.done();
    },
    'from, subject': function (test) {
        test.expect(1);
        this.plugin.cfg.main.headers_to_sign='from,subject';
        var r = this.plugin.get_headers_to_sign(this.plugin.cfg);
        test.deepEqual(r, ['from','subject']);
        test.done();
    },
    'missing from': function (test) {
        test.expect(1);
        this.plugin.cfg.main.headers_to_sign='subject';
        var r = this.plugin.get_headers_to_sign(this.plugin.cfg);
        test.deepEqual(r, ['subject', 'from']);
        test.done();
    },
};
