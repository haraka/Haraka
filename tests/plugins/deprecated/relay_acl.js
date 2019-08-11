'use strict';

const fixtures     = require('haraka-test-fixtures');

function _set_up (done) {

    this.plugin = new fixtures.plugin('relay_acl');
    this.plugin.cfg = {};

    this.connection = fixtures.connection.createConnection();
    this.connection.transaction = {
        results: new fixtures.results(this.connection),
    };

    done();
}

exports.is_acl_allowed = {
    setUp : _set_up,
    'bare IP' (test) {
        test.expect(3);
        this.plugin.acl_allow=['127.0.0.6'];
        this.connection.remote.ip='127.0.0.6';
        test.equal(true, this.plugin.is_acl_allowed(this.connection));
        this.connection.remote.ip='127.0.0.5';
        test.equal(false, this.plugin.is_acl_allowed(this.connection));
        this.connection.remote.ip='127.0.1.5';
        test.equal(false, this.plugin.is_acl_allowed(this.connection));
        test.done();
    },
    'netmask' (test) {
        test.expect(3);
        this.plugin.acl_allow=['127.0.0.6/24'];
        this.connection.remote.ip='127.0.0.6';
        test.equal(true, this.plugin.is_acl_allowed(this.connection));
        this.connection.remote.ip='127.0.0.5';
        test.equal(true, this.plugin.is_acl_allowed(this.connection));
        this.connection.remote.ip='127.0.1.5';
        test.equal(false, this.plugin.is_acl_allowed(this.connection));
        test.done();
    },
    'mixed (ipv4 & ipv6 (Issue #428))' (test) {
        test.expect(3);
        this.connection.remote.ip='2607:f060:b008:feed::2';
        test.equal(false, this.plugin.is_acl_allowed(this.connection));

        this.plugin.acl_allow=['2607:f060:b008:feed::2/64'];
        this.connection.remote.ip='2607:f060:b008:feed::2';
        test.equal(true, this.plugin.is_acl_allowed(this.connection));

        this.plugin.acl_allow=['127.0.0.6/24'];
        this.connection.remote.ip='2607:f060:b008:feed::2';
        test.equal(false, this.plugin.is_acl_allowed(this.connection));

        test.done();
    },
}

exports.relay_dest_domains = {
    setUp : _set_up,
    'relaying' (test) {
        test.expect(2);
        const outer = this;
        function next () {
            // console.log(outer.connection.results.get('relay_acl'));
            // console.log(outer.connection.transaction.results.get('relay_acl'));
            test.equal(undefined, arguments[0]);
            test.equal(1, outer.connection.transaction.results.get('relay_acl').skip.length);
            test.done();
        }
        this.connection.relaying=true;
        this.plugin.relay_dest_domains(next, this.connection, [{host:'foo'}]);
    },
    'no config' (test) {
        test.expect(2);
        const outer = this;
        function next () {
            test.equal(undefined, arguments[0]);
            test.equal(1, outer.connection.transaction.results.get('relay_acl').skip.length);
            test.done();
        }
        this.plugin.relay_dest_domains(next, this.connection, [{host:'foo'}]);
    },
    'action=undef' (test) {
        test.expect(2);
        const outer = this;
        function next () {
            test.equal(DENY, arguments[0]);
            test.equal(1, outer.connection.transaction.results.get('relay_acl').fail.length);
            test.done();
        }
        this.plugin.cfg.domains = { foo: '{"action":"dunno"}' };
        this.plugin.relay_dest_domains(next, this.connection, [{host:'foo'}]);
    },
    'action=deny' (test) {
        test.expect(2);
        const outer = this;
        function next () {
            test.equal(DENY, arguments[0]);
            test.equal(1, outer.connection.transaction.results.get('relay_acl').fail.length);
            test.done();
        }
        this.plugin.cfg.domains = { foo: '{"action":"deny"}' };
        this.plugin.relay_dest_domains(next, this.connection, [{host:'foo'}]);
    },
    'action=continue' (test) {
        test.expect(2);
        const outer = this;
        function next () {
            test.equal(CONT, arguments[0]);
            test.equal(1, outer.connection.transaction.results.get('relay_acl').pass.length);
            test.done();
        }
        this.plugin.cfg.domains = { foo: '{"action":"continue"}' };
        this.plugin.relay_dest_domains(next, this.connection, [{host:'foo'}]);
    },
    'action=accept' (test) {
        test.expect(2);
        const outer = this;
        function next () {
            test.equal(CONT, arguments[0]);
            test.equal(1, outer.connection.transaction.results.get('relay_acl').pass.length);
            test.done();
        }
        this.plugin.cfg.domains = { foo: '{"action":"continue"}' };
        this.plugin.relay_dest_domains(next, this.connection, [{host:'foo'}]);
    },
}

exports.refresh_config = {
    setUp : _set_up,
    'callback' (test) {
        test.expect(1);
        function next () {
            test.equal(undefined, arguments[0]);
            test.done();
        }
        this.plugin.refresh_config(next, this.connection);
    },
}
