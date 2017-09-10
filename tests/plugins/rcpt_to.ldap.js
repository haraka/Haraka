'use strict';

const Address      = require('address-rfc2821').Address;
const fixtures     = require('haraka-test-fixtures');

const _set_up = function (done) {

    this.plugin = new fixtures.plugin('rcpt_to.ldap');
    this.plugin.inherits('rcpt_to.host_list_base');

    this.plugin.cfg = {};
    this.plugin.host_list = {};
    this.connection = fixtures.connection.createConnection();
    this.connection.transaction = {
        results: new fixtures.results(this.connection),
        notes: {},
        rcpt_to: [new Address('test@test.com')]
    };

    done();
};

exports.in_host_list = {
    setUp : _set_up,
    'miss' : function (test) {
        test.expect(1);
        test.equal(false, this.plugin.in_host_list('test.com'));
        test.done();
    },
    'hit' : function (test) {
        test.expect(1);
        this.plugin.host_list['test.com'] = true;
        test.equal(true, this.plugin.in_host_list('test.com'));
        test.done();
    },
};

exports.in_ldap_ini = {
    setUp : _set_up,
    'miss' : function (test) {
        test.expect(1);
        test.equal(false, this.plugin.in_ldap_ini('test.com'));
        test.done();
    },
    'hit' : function (test) {
        test.expect(1);
        this.plugin.cfg['test.com'] = { server: 'foo.test.com' };
        test.equal(true, this.plugin.in_ldap_ini('test.com'));
        test.done();
    },
};

exports.ldap_rcpt = {
    setUp : _set_up,
    'missing txn' : function (test) {
        test.expect(3);
        // sometimes txn goes away, make sure it's handled
        const next = function (rc, msg) {
            test.equal(undefined, rc);
            test.equal(undefined, msg);
        };
        delete this.connection.transaction;
        this.plugin.ldap_rcpt(next, this.connection, [new Address('test@test.com')]);
        test.ok(true);
        test.done();
    },
    'not in host_list or rcpt_to.ldap.ini' : function (test) {
        test.expect(2);
        const next = function (rc, msg) {
            test.equal(undefined, rc);
            test.equal(undefined, msg);
            test.done();
        };
        this.plugin.ldap_rcpt(next, this.connection, [new Address('test@test.com')]);
    },
    'in host_list' : function (test) {
        test.expect(1);
        const next = function (rc, msg) {
            test.equal('connecting', this.connection.transaction.results.get('rcpt_to.ldap').msg[0]);
            test.done();
        }.bind(this);
        this.plugin.host_list = { 'test.com': true };
        this.plugin.ldap_rcpt(next, this.connection, [new Address('test@test.com')]);
    },
    'in rcpt_to.ldap.ini' : function (test) {
        test.expect(1);
        const next = function (rc, msg) {
            test.equal('connecting', this.connection.transaction.results.get('rcpt_to.ldap').msg[0]);
            test.done();
        }.bind(this);
        this.plugin.cfg['test.com'] = { server: 'ldap.test.com' };
        this.plugin.ldap_rcpt(next, this.connection, [new Address('test@test.com')]);
    },
    // TODO: detect a working LDAP server and test against it
};
