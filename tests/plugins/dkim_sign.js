'use strict';

const fs           = require('fs');
const path         = require('path');

const Address      = require('address-rfc2821');
const fixtures     = require('haraka-test-fixtures');
const utils        = require('haraka-utils');

const Connection   = fixtures.connection;

function _set_up (done) {

    this.plugin = new fixtures.plugin('dkim_sign');
    this.plugin.config.root_path = path.resolve(__dirname, '../config');
    this.plugin.cfg = { main: { } };

    this.connection = Connection.createConnection();
    this.connection.init_transaction();
    this.connection.transaction.mail_from = {};

    done();
}

exports.register = {
    setUp : _set_up,
    'registers plugin' (test) {
        test.expect(2);
        test.deepEqual(this.plugin.cfg, { main: {} });
        this.plugin.register();
        test.deepEqual(this.plugin.cfg,
            { main:
               {   disabled: false,
                   selector: 'mail',
                   domain: 'example.com',
                   headers_to_sign: 'From, Sender, Reply-To, Subject, Date, Message-ID, To, Cc, MIME-Version'
               },
            headers_to_sign: [ 'from','sender','reply-to','subject','date','message-id','to','cc','mime-version' ]
            }
        );
        test.done();
    },
}

exports.load_dkim_sign_ini = {
    setUp : _set_up,
    'loads dkim_sign.ini' (test) {
        test.expect(2);
        test.deepEqual(this.plugin.cfg, { main: {} });
        this.plugin.load_dkim_sign_ini();
        test.deepEqual(this.plugin.cfg,
            { main:
               {   disabled: false,
                   selector: 'mail',
                   domain: 'example.com',
                   headers_to_sign: 'From, Sender, Reply-To, Subject, Date, Message-ID, To, Cc, MIME-Version'
               },
            headers_to_sign: [ 'from','sender','reply-to','subject','date','message-id','to','cc','mime-version' ]
            }
        );
        test.done();
    },
}

exports.get_sender_domain = {
    setUp : _set_up,
    'no transaction' (test) {
        test.expect(1);
        delete this.connection.transaction;
        test.equal(
            this.plugin.get_sender_domain(this.connection),
            undefined
        );
        test.done();
    },
    'no headers' (test) {
        test.expect(1);
        test.equal(
            this.plugin.get_sender_domain(this.connection),
            undefined
        );
        test.done();
    },
    'no from header' (test) {
        test.expect(1);
        this.connection.transaction.header.add('Date', utils.date_to_str(new Date()));
        test.equal(
            this.plugin.get_sender_domain(this.connection),
            undefined
        );
        test.done();
    },
    'no from header, env MAIL FROM' (test) {
        test.expect(1);
        this.connection.transaction.mail_from = new Address.Address('<test@example.com>');
        const r = this.plugin.get_sender_domain(this.connection);
        test.equal('example.com', r);
        test.done();
    },
    'env MAIL FROM, case insensitive' (test) {
        test.expect(1);
        this.connection.transaction.mail_from = new Address.Address('<test@Example.cOm>');
        const r = this.plugin.get_sender_domain(this.connection);
        test.equal('example.com', r);
        test.done();
    },
    'From header not a fqdn' (test) {
        test.expect(1);
        this.connection.transaction.header.add('From', 'root (Cron Daemon)');
        const r = this.plugin.get_sender_domain(this.connection);
        this.plugin.get_key_dir(this.connection, { domain: r }, (err, dir) => {
            test.equal(dir, undefined);
            test.done();
        });
    },
    'from header, simple' (test) {
        test.expect(1);
        this.connection.transaction.header.add('From', 'John Doe <jdoe@example.com>');
        const r = this.plugin.get_sender_domain(this.connection);
        test.equal('example.com', r);
        test.done();
    },
    'from header, case insensitive' (test) {
        test.expect(1);
        this.connection.transaction.header.add('From', 'John Doe <jdoe@Example.Com>');
        const r = this.plugin.get_sender_domain(this.connection);
        test.equal('example.com', r);
        test.done();
    },
    'from header, less simple' (test) {
        test.expect(1);
        this.connection.transaction.header.add('From', '"Joe Q. Public" <john.q.public@example.com>');
        const r = this.plugin.get_sender_domain(this.connection);
        test.equal('example.com', r);
        test.done();
    },
    'from header, RFC 5322 odd' (test) {
        test.expect(1);
        this.connection.transaction.header.add('From', 'Pete(A nice \\) chap) <pete(his account)@silly.test(his host)>');
        const r = this.plugin.get_sender_domain(this.connection);
        test.equal('silly.test', r);
        test.done();
    },
    'from header group' (test) {
        test.expect(1);
        this.connection.transaction.header.add('From', 'ben@example.com,carol@example.com');
        this.connection.transaction.header.add('Sender', 'dave@example.net');
        const r = this.plugin.get_sender_domain(this.connection);
        test.equal('example.net', r);
        test.done();
    },
    'from header group, RFC 6854' (test) {
        test.expect(1);
        // TODO: this test passes, but the parsing isn't correct. The From
        // addr parser doesn't support the RFC 6854 Group Syntax
        this.connection.transaction.header.add('From', 'Managing Partners:ben@example.com,carol@example.com;');
        this.connection.transaction.header.add('Sender', 'dave@example.net');
        const r = this.plugin.get_sender_domain(this.connection);
        test.equal('example.net', r);
        test.done();
    },
}

exports.get_key_dir = {
    setUp (done) {
        this.plugin = new fixtures.plugin('dkim_sign');
        this.plugin.cfg = { main: { } };

        this.connection = Connection.createConnection();
        this.connection.init_transaction();

        fs.mkdir(path.resolve('tests','config','dkim'), err => {
            // if (err) console.error(err);
            fs.mkdir(path.resolve('tests','config','dkim','example.com'), err2 => {
                // if (err2) console.error(err2);
                done();
            });
        });
    },
    'no transaction' (test) {
        test.expect(2);
        this.plugin.get_key_dir(this.connection, '', (err, dir) => {
            test.ifError(err);
            test.equal(dir, undefined);
            test.done();
        });
    },
    'no key dir' (test) {
        test.expect(1);
        this.connection.transaction.mail_from = new Address.Address('<matt@non-exist.com>');
        this.plugin.get_key_dir(this.connection, 'non-exist.com', (err, dir) => {
            test.equal(dir, undefined);
            test.done();
        });
    },
    'test example.com key dir' (test) {
        test.expect(1);
        process.env.HARAKA = path.resolve('tests');
        this.connection.transaction.mail_from = new Address.Address('<matt@example.com>');
        this.plugin.get_key_dir(this.connection, { domain: 'example.com' }, (err, dir) => {
            // console.log(arguments);
            const expected = path.resolve('tests','config','dkim','example.com');
            test.equal(dir, expected);
            test.done();
        });
    },
}

exports.get_headers_to_sign = {
    setUp : _set_up,
    'none configured, includes from' (test) {
        test.expect(1);
        test.deepEqual(
            this.plugin.get_headers_to_sign(this.plugin.cfg),
            ['from']
        );
        test.done();
    },
    'from, subject' (test) {
        test.expect(1);
        this.plugin.cfg.main.headers_to_sign='from,subject';
        test.deepEqual(
            this.plugin.get_headers_to_sign(this.plugin.cfg),
            ['from','subject']
        );
        test.done();
    },
    'subject configured, subject and from returned' (test) {
        test.expect(1);
        this.plugin.cfg.main.headers_to_sign='subject';
        test.deepEqual(
            this.plugin.get_headers_to_sign(this.plugin.cfg),
            ['subject', 'from']
        );
        test.done();
    },
}

const insecure_512b_test_key = '-----BEGIN RSA PRIVATE KEY-----\nMIGqAgEAAiEAsw3E27MbZuxmWpYfjNX5XzKTMxIv8bIAU/MpjiJE5rkCAwEAAQIg\nIVsyTj96nlzx4HRRIlqGXw7wx3C+vGhoM/Ql/eFXRVECEQDbUYF19fyzPDKAqb7p\nEu5tAhEA0QBD5Ns4QgpC8m1Qob05/QIQf1jWWU5aSyC7GmZ2ChQKCQIQIACNZNaY\nZ6xQkfRhG1LxNQIRAIyKwDCULf7Jl5ygc1MIIdk=\n-----END RSA PRIVATE KEY-----';

exports.get_sign_properties = {
    setUp (done) {
        this.plugin = new fixtures.plugin('dkim_sign');
        this.plugin.cfg = { main: { } };

        this.connection = Connection.createConnection();
        this.connection.init_transaction();
        this.connection.transaction.mail_from = {};

        this.plugin.config.root_path = path.resolve(__dirname, '../config');
        this.plugin.load_dkim_sign_ini();
        this.plugin.load_dkim_default_key();

        done();
    },
    'example.com from ENV mail from' (test) {
        test.expect(1);
        this.connection.transaction.mail_from = new Address.Address('<test@example.com>');
        this.plugin.get_sign_properties(this.connection, (err, props) => {
            if (err) console.error(err);
            test.deepEqual(props, {
                domain: 'example.com',
                selector: 'aug2019',
                private_key: insecure_512b_test_key,
            });
            test.done();
        })
    },
    'no domain discovered returns default' (test) {
        test.expect(1);
        this.plugin.get_sign_properties(this.connection, (err, props) => {
            if (err) console.error(err);
            test.deepEqual(props, {
                domain: this.plugin.cfg.main.domain,
                selector: this.plugin.cfg.main.selector,
                private_key: this.plugin.private_key,
            });
            test.done();
        })
    },
}

exports.has_key_data = {
    setUp (done) {
        this.plugin = new fixtures.plugin('dkim_sign');
        this.plugin.cfg = { main: { } };

        this.connection = Connection.createConnection();
        done()
    },
    'no data' (test) {
        test.expect(1);
        test.equal(this.plugin.has_key_data(this.connection, {}), false);
        test.done();
    },
    'fully populated' (test) {
        test.expect(1);
        test.equal(this.plugin.has_key_data(this.connection, {
            selector: 'foo',
            domain: 'bar',
            private_key: 'anything',
        }), true);
        test.done();
    },
}

exports.load_key = {
    setUp : _set_up,
    'example.com test key' (test) {
        test.expect(1);
        const testKey = path.resolve('tests','config','dkim','example.com','private');
        test.equal(this.plugin.load_key(testKey), insecure_512b_test_key);
        test.done();
    },
}
