'use strict';

const fs           = require('fs');
const path         = require('path');

const Address      = require('address-rfc2821');
const fixtures     = require('haraka-test-fixtures');
const utils        = require('haraka-utils');

const Connection   = fixtures.connection;

const _set_up = function (done) {

    this.plugin = new fixtures.plugin('dkim_sign');
    this.plugin.cfg = { main: { } };

    this.connection = Connection.createConnection();
    this.connection.transaction = fixtures.transaction.createTransaction();

    done();
};

exports.get_sender_domain = {
    setUp : _set_up,
    'no transaction': function (test) {
        test.expect(1);
        delete this.connection.transaction;
        test.equal(
            this.plugin.get_sender_domain(this.connection.transaction),
            undefined
        );
        test.done();
    },
    'no headers': function (test) {
        test.expect(1);
        test.equal(
            this.plugin.get_sender_domain(this.connection.transaction),
            undefined
        );
        test.done();
    },
    'no from header': function (test) {
        test.expect(1);
        this.connection.transaction.header.add('Date', utils.date_to_str(new Date()));
        test.equal(
            this.plugin.get_sender_domain(this.connection.transaction),
            undefined
        );
        test.done();
    },
    'no from header, env MAIL FROM': function (test) {
        test.expect(1);
        this.connection.transaction.mail_from = new Address.Address('<test@example.com>');
        const r = this.plugin.get_sender_domain(this.connection.transaction);
        test.equal('example.com', r);
        test.done();
    },
    'env MAIL FROM, case insensitive': function (test) {
        test.expect(1);
        this.connection.transaction.mail_from = new Address.Address('<test@Example.cOm>');
        const r = this.plugin.get_sender_domain(this.connection.transaction);
        test.equal('example.com', r);
        test.done();
    },
    'from header, simple': function (test) {
        test.expect(1);
        this.connection.transaction.header.add('From', 'John Doe <jdoe@example.com>');
        const r = this.plugin.get_sender_domain(this.connection.transaction);
        test.equal('example.com', r);
        test.done();
    },
    'from header, case insensitive': function (test) {
        test.expect(1);
        this.connection.transaction.header.add('From', 'John Doe <jdoe@Example.Com>');
        const r = this.plugin.get_sender_domain(this.connection.transaction);
        test.equal('example.com', r);
        test.done();
    },
    'from header, less simple': function (test) {
        test.expect(1);
        this.connection.transaction.header.add('From', '"Joe Q. Public" <john.q.public@example.com>');
        const r = this.plugin.get_sender_domain(this.connection.transaction);
        test.equal('example.com', r);
        test.done();
    },
    'from header, RFC 5322 odd': function (test) {
        test.expect(1);
        this.connection.transaction.header.add('From', 'Pete(A nice \\) chap) <pete(his account)@silly.test(his host)>');
        const r = this.plugin.get_sender_domain(this.connection.transaction);
        test.equal('silly.test', r);
        test.done();
    },
    'from header group': function (test) {
        test.expect(1);
        this.connection.transaction.header.add('From', 'ben@example.com,carol@example.com');
        this.connection.transaction.header.add('Sender', 'dave@example.net');
        const r = this.plugin.get_sender_domain(this.connection.transaction);
        test.equal('example.net', r);
        test.done();
    },
    'from header group, RFC 6854': function (test) {
        test.expect(1);
        // TODO: this test passes, but the parsing isn't correct. The From
        // addr parser doesn't support the RFC 6854 Group Syntax
        this.connection.transaction.header.add('From', 'Managing Partners:ben@example.com,carol@example.com;');
        this.connection.transaction.header.add('Sender', 'dave@example.net');
        const r = this.plugin.get_sender_domain(this.connection.transaction);
        test.equal('example.net', r);
        test.done();
    },
};

exports.get_key_dir = {
    setUp : function (done) {
        this.plugin = new fixtures.plugin('dkim_sign');
        this.plugin.cfg = { main: { } };

        this.connection = Connection.createConnection();
        this.connection.transaction = fixtures.transaction.createTransaction();

        fs.mkdir(path.resolve('tests','config','dkim'), function (err) {
            // if (err) console.error(err);
            fs.mkdir(path.resolve('tests','config','dkim','example.com'), function (err2) {
                // if (err2) console.error(err2);
                done();
            });
        });
    },
    'no transaction': function (test) {
        test.expect(2);
        this.plugin.get_key_dir(this.connection, function (err, dir) {
            test.equal(err, undefined);
            test.equal(dir, undefined);
            test.done();
        });
    },
    'no key dir': function (test) {
        test.expect(1);
        this.connection.transaction.mail_from =
            new Address.Address('<matt@non-exist.com>');
        this.plugin.get_key_dir(this.connection, function (err, dir) {
            test.equal(dir, undefined);
            test.done();
        });
    },
    'test example.com key dir': function (test) {
        test.expect(1);
        process.env.HARAKA = path.resolve('tests');
        this.connection.transaction.mail_from =
            new Address.Address('<matt@example.com>');
        this.plugin.get_key_dir(this.connection, function (err, dir) {
            // console.log(arguments);
            const expected = path.resolve('tests','config','dkim','example.com');
            test.equal(dir, expected);
            test.done();
        });
    },
};

exports.get_headers_to_sign = {
    setUp : _set_up,
    'none': function (test) {
        test.expect(1);
        test.deepEqual(
            this.plugin.get_headers_to_sign(this.plugin.cfg),
            []
        );
        test.done();
    },
    'from, subject': function (test) {
        test.expect(1);
        this.plugin.cfg.main.headers_to_sign='from,subject';
        test.deepEqual(
            this.plugin.get_headers_to_sign(this.plugin.cfg),
            ['from','subject']
        );
        test.done();
    },
    'missing from': function (test) {
        test.expect(1);
        this.plugin.cfg.main.headers_to_sign='subject';
        test.deepEqual(
            this.plugin.get_headers_to_sign(this.plugin.cfg),
            ['subject', 'from']
        );
        test.done();
    },
};
