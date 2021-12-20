'use strict';

const fixtures     = require('haraka-test-fixtures');

function _set_up (done) {

    this.plugin = new fixtures.plugin('relay');
    this.plugin.cfg = {};
    this.connection = fixtures.connection.createConnection();

    done();
}

exports.plugin = {
    setUp : _set_up,
    'should have register function' (test) {
        test.expect(2);
        test.ok(this.plugin);
        test.equal('function', typeof this.plugin.register);
        test.done();
    },
    'register function should call register_hook()' (test) {
        test.expect(1);
        // console.log(this.plugin);
        this.plugin.register();
        test.ok(this.plugin.register_hook.called);
        // console.log(this.plugin);
        test.done();
    },
}

exports.load_config_files = {
    setUp : _set_up,
    'relay.ini' (test) {
        test.expect(3);
        this.plugin.load_relay_ini();
        test.ok(typeof this.plugin.cfg === 'object');
        test.ok(this.plugin.cfg);
        test.ok(this.plugin.cfg.relay);
        test.done();
    },
    'relay_dest_domains.ini' (test) {
        test.expect(1);
        this.plugin.load_dest_domains();
        test.ok(typeof this.plugin.dest === 'object');
        test.done();
    },
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

exports.acl = {
    setUp (callback) {
        this.plugin = new fixtures.plugin('relay');
        this.plugin.cfg = { relay: { dest_domains: true } };
        this.connection = fixtures.connection.createConnection();
        callback();
    },
    'relay.acl=false' (test) {
        test.expect(1);
        function next (rc) {
            test.equal(undefined, rc);
            test.done();
        }
        this.plugin.cfg.relay.acl=false;
        this.plugin.acl(() => {}, this.connection);
        this.plugin.pass_relaying(next, this.connection);
    },
    'relay.acl=true, miss' (test) {
        test.expect(2);
        const next = function (rc) {
            test.equal(undefined, rc);
            test.equal(false, this.connection.relaying);
            test.done();
        }.bind(this);
        this.plugin.cfg.relay.acl=true;
        this.plugin.acl(() => {}, this.connection);
        this.plugin.pass_relaying(next, this.connection);
    },
    'relay.acl=true, hit' (test) {
        test.expect(2);
        const next = function (rc) {
            test.equal(OK, rc);
            test.equal(true, this.connection.relaying);
            test.done();
        }.bind(this);
        this.plugin.cfg.relay.acl=true;
        this.connection.remote.ip='1.1.1.1';
        this.plugin.acl_allow=['1.1.1.1/32'];
        this.plugin.acl(() => {}, this.connection);
        this.plugin.pass_relaying(next, this.connection);
    },
    'relay.acl=true, hit, missing mask' (test) {
        test.expect(2);
        const next = function (rc) {
            test.equal(OK, rc);
            test.equal(true, this.connection.relaying);
            test.done();
        }.bind(this);
        this.plugin.cfg.relay.acl=true;
        this.connection.remote.ip='1.1.1.1';
        this.plugin.acl_allow=['1.1.1.1'];
        this.plugin.acl(() => {}, this.connection);
        this.plugin.pass_relaying(next, this.connection);
    },
    'relay.acl=true, hit, net' (test) {
        test.expect(2);
        const next = function (rc) {
            test.equal(OK, rc);
            test.equal(true, this.connection.relaying);
            test.done();
        }.bind(this);
        this.plugin.cfg.relay.acl=true;
        this.connection.remote.ip='1.1.1.1';
        this.plugin.acl_allow=['1.1.1.1/24'];
        this.plugin.acl(() => {}, this.connection);
        this.plugin.pass_relaying(next, this.connection);
    },
}

exports.dest_domains = {
    setUp (callback) {
        this.plugin = new fixtures.plugin('relay');
        this.plugin.cfg = { relay: { dest_domains: true } };

        this.connection = fixtures.connection.createConnection();
        this.connection.transaction = {
            results: new fixtures.results(this.connection),
        };

        callback();
    },
    'relay.dest_domains=false' (test) {
        test.expect(1);
        function next (rc) {
            test.equal(undefined, rc);
            test.done();
        }
        this.plugin.cfg.relay.dest_domains=false;
        this.plugin.dest_domains(next, this.connection, [{host:'foo'}]);
    },
    'relaying' (test) {
        test.expect(2);
        const next = function (rc) {
            test.equal(undefined, rc);
            test.equal(1, this.connection.transaction.results.get('relay').skip.length);
            test.done();
        }.bind(this);
        this.connection.relaying=true;
        this.plugin.dest_domains(next, this.connection, [{host:'foo'}]);
    },
    'no config' (test) {
        test.expect(2);
        const next = function (rc) {
            test.equal(undefined, rc);
            test.equal(1, this.connection.transaction.results.get('relay').err.length);
            test.done();
        }.bind(this);
        this.plugin.dest_domains(next, this.connection, [{host:'foo'}]);
    },
    'action=undef' (test) {
        test.expect(2);
        const next = function (rc) {
            test.equal(DENY, rc);
            test.equal(1, this.connection.transaction.results.get('relay').fail.length);
            test.done();
        }.bind(this);
        this.plugin.dest = { domains: { foo: '{"action":"dunno"}' } };
        this.plugin.dest_domains(next, this.connection, [{host:'foo'}]);
    },
    'action=deny' (test) {
        test.expect(2);
        const next = function (rc) {
            test.equal(DENY, rc);
            test.equal(1, this.connection.transaction.results.get('relay').fail.length);
            test.done();
        }.bind(this);
        this.plugin.dest = { domains: { foo: '{"action":"deny"}' } };
        this.plugin.dest_domains(next, this.connection, [{host:'foo'}]);
    },
    'action=continue' (test) {
        test.expect(2);
        const next = function (rc) {
            test.equal(CONT, rc);
            test.equal(1, this.connection.transaction.results.get('relay').pass.length);
            test.done();
        }.bind(this);
        this.plugin.dest = { domains: { foo: '{"action":"continue"}' } };
        this.plugin.dest_domains(next, this.connection, [{host:'foo'}]);
    },
    'action=accept' (test) {
        test.expect(2);
        const next = function (rc) {
            test.equal(CONT, rc);
            test.equal(1, this.connection.transaction.results.get('relay').pass.length);
            test.done();
        }.bind(this);
        this.plugin.dest = { domains: { foo: '{"action":"continue"}' } };
        this.plugin.dest_domains(next, this.connection, [{host:'foo'}]);
    },
}

exports.force_routing = {
    setUp (callback) {
        this.plugin = new fixtures.plugin('relay');
        this.plugin.cfg = { relay: { force_routing: true } };
        this.plugin.dest = {};

        this.connection = fixtures.connection.createConnection();
        this.connection.transaction = {
            results: new fixtures.results(this.connection),
        };

        callback();
    },
    'relay.force_routing=false' (test) {
        test.expect(1);
        function next (rc) {
            test.equal(undefined, rc);
            test.done();
        }
        this.plugin.cfg.relay.force_routing=false;
        this.plugin.force_routing(next, this.connection, 'foo');
    },
    'dest_domains empty' (test) {
        test.expect(1);
        function next (rc) {
            test.equal(undefined, rc);
            test.done();
        }
        this.plugin.force_routing(next, this.connection, 'foo');
    },
    'dest_domains, no route' (test) {
        test.expect(2);
        function next (rc, nexthop) {
            // console.log(arguments);
            test.equal(undefined, rc);
            test.equal(undefined, nexthop);
            test.done();
        }
        this.plugin.dest = { domains: { foo: '{"action":"blah blah"}' } };
        this.plugin.force_routing(next, this.connection, 'foo');
    },
    'dest_domains, route' (test) {
        test.expect(2);
        function next (rc, nexthop) {
            test.equal(OK, rc);
            test.equal('other-server', nexthop);
            test.done();
        }
        this.plugin.dest = { domains: { foo: '{"action":"blah blah","nexthop":"other-server"}' } };
        this.plugin.force_routing(next, this.connection, 'foo');
    },
    'dest-domains, any' (test) {
        test.expect(2);
        function next (rc, nexthop) {
            test.equal(OK, rc);
            test.equal('any-server', nexthop);
            test.done();
        }
        this.plugin.dest = { domains: { foo: '{"action":"blah blah","nexthop":"other-server"}',
            any: '{"action":"blah blah","nexthop":"any-server"}'} };
        this.plugin.force_routing(next, this.connection, 'not');
    }
}

exports.all = {
    setUp : _set_up,
    'register_hook() should register available function' (test) {
        test.expect(3);
        test.ok(this.plugin.all);
        test.equal('function', typeof this.plugin.all);
        this.plugin.register();
        this.plugin.cfg.relay.all = true;
        this.plugin.register_hook('rcpt', 'all');  // register() doesn't b/c config is disabled
        // console.log(this.plugin.register_hook.args);
        console.log(this.plugin.register_hook.args);
        test.equals(this.plugin.register_hook.args[3][1], 'all');
        test.done();
    },
    'all hook always returns OK' (test) {
        function next (action) {
            test.expect(1);
            test.equals(action, OK);
            test.done();
        }
        this.plugin.cfg.relay = { all: true };
        this.plugin.all(next, this.connection, ['foo@bar.com']);
    },
    'all hook always sets connection.relaying to 1' (test) {
        const next = function (action) {
            test.expect(1);
            test.equals(this.connection.relaying, 1);
            test.done();
        }.bind(this);

        this.plugin.cfg.relay = { all: true };
        this.plugin.all(next, this.connection, ['foo@bar.com']);
    }
}
