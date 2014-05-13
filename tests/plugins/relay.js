var stub         = require('../fixtures/stub'),
    constants    = require('../../constants'),
    Connection   = require('../fixtures/stub_connection'),
    Plugin       = require('../fixtures/stub_plugin'),
    configfile   = require('../../configfile'),
    config       = require('../../config'),
    ResultStore  = require("../../result_store");

constants.import(global);

function _set_up(callback) {
    this.backup = {};

    this.plugin = Plugin('relay');
    this.plugin.config = config;
    this.plugin.cfg = {};

    this.connection = Connection.createConnection();
    this.connection.results = new ResultStore(this.connection);
    this.connection.transaction = {
        results: new ResultStore(this.connection),
    };

    callback();
}

function _tear_down(callback) {
    callback();
}

exports.plugin = {
    setUp : _set_up,
    tearDown : _tear_down,
    'should have register function' : function (test) {
        test.expect(2);
        test.isNotNull(this.plugin);
        test.isFunction(this.plugin.register);
        test.done();
    },
    'register function should call register_hook()' : function (test) {
        test.expect(1);
        // console.log(this.plugin);
        this.plugin.register();
        test.ok(this.plugin.register_hook.called);
        // console.log(this.plugin);
        test.done();
    },
};

exports.refresh_config = {
    setUp : _set_up,
    tearDown : _tear_down,
    'relay.ini' : function (test) {
        test.expect(5);
        this.plugin.refresh_config();
        test.ok(this.plugin.cfg);
        test.ok(this.plugin.cfg.relay);
        test.ok(Array.isArray(this.plugin.acl_allow));
        test.ok(typeof this.plugin.cfg === 'object');
        test.ok(typeof this.plugin.dest === 'object');
        test.done();
    },
};

exports.is_acl_allowed = {
    setUp : _set_up,
    tearDown : _tear_down,
    'bare IP' : function (test) {
        test.expect(3);
        this.plugin.acl_allow=['127.0.0.6'];
        this.connection.remote_ip='127.0.0.6';
        test.equal(true, this.plugin.is_acl_allowed(this.connection));
        this.connection.remote_ip='127.0.0.5';
        test.equal(false, this.plugin.is_acl_allowed(this.connection));
        this.connection.remote_ip='127.0.1.5';
        test.equal(false, this.plugin.is_acl_allowed(this.connection));
        test.done();
    },
    'netmask' : function (test) {
        test.expect(3);
        this.plugin.acl_allow=['127.0.0.6/24'];
        this.connection.remote_ip='127.0.0.6';
        test.equal(true, this.plugin.is_acl_allowed(this.connection));
        this.connection.remote_ip='127.0.0.5';
        test.equal(true, this.plugin.is_acl_allowed(this.connection));
        this.connection.remote_ip='127.0.1.5';
        test.equal(false, this.plugin.is_acl_allowed(this.connection));
        test.done();
    },
    'mixed (ipv4 & ipv6 (Issue #428))' : function (test) {
        test.expect(3);
        this.connection.remote_ip='2607:f060:b008:feed::2';
        test.equal(false, this.plugin.is_acl_allowed(this.connection));

        this.plugin.acl_allow=['2607:f060:b008:feed::2/64'];
        this.connection.remote_ip='2607:f060:b008:feed::2';
        test.equal(true, this.plugin.is_acl_allowed(this.connection));

        this.plugin.acl_allow=['127.0.0.6/24'];
        this.connection.remote_ip='2607:f060:b008:feed::2';
        test.equal(false, this.plugin.is_acl_allowed(this.connection));

        test.done();
    },
};

exports.acl = {
    setUp : function (callback) {
        this.plugin = Plugin('relay');
        this.plugin.config = config;
        this.plugin.cfg = { relay: { dest_domains: true } };
        this.connection = Connection.createConnection();
        this.connection.results = new ResultStore(this.connection);
        callback();
    },
    tearDown : _tear_down,
    'relay.acl=false' : function (test) {
        test.expect(1);
        var next = function(rc) {
            test.equal(undefined, rc);
            test.done();
        };
        this.plugin.cfg.relay.acl=false;
        this.plugin.acl(next, this.connection);
    },
    'relay.acl=true, miss' : function (test) {
        test.expect(2);
        var next = function(rc) {
            test.equal(undefined, rc);
            test.equal(false, this.connection.relaying);
            test.done();
        }.bind(this);
        this.plugin.cfg.relay.acl=true;
        this.plugin.acl(next, this.connection);
    },
    'relay.acl=true, hit' : function (test) {
        test.expect(2);
        var next = function(rc) {
            test.equal(OK, rc);
            test.equal(true, this.connection.relaying);
            test.done();
        }.bind(this);
        this.plugin.cfg.relay.acl=true;
        this.connection.remote_ip='1.1.1.1';
        this.plugin.acl_allow=['1.1.1.1/32'];
        this.plugin.acl(next, this.connection);
    },
    'relay.acl=true, hit, missing mask' : function (test) {
        test.expect(2);
        var next = function(rc) {
            test.equal(OK, rc);
            test.equal(true, this.connection.relaying);
            test.done();
        }.bind(this);
        this.plugin.cfg.relay.acl=true;
        this.connection.remote_ip='1.1.1.1';
        this.plugin.acl_allow=['1.1.1.1'];
        this.plugin.acl(next, this.connection);
    },
    'relay.acl=true, hit, net': function (test) {
        test.expect(2);
        var next = function(rc) {
            test.equal(OK, rc);
            test.equal(true, this.connection.relaying);
            test.done();
        }.bind(this);
        this.plugin.cfg.relay.acl=true;
        this.connection.remote_ip='1.1.1.1';
        this.plugin.acl_allow=['1.1.1.1/24'];
        this.plugin.acl(next, this.connection);
    },
};

exports.dest_domains = {
    setUp : function (callback) {
        this.plugin = Plugin('relay');
        this.plugin.config = config;
        this.plugin.cfg = { relay: { dest_domains: true } };

        this.connection = Connection.createConnection();
        this.connection.results = new ResultStore(this.connection);
        this.connection.transaction = {
            results: new ResultStore(this.connection),
        };

        callback();
    },
    tearDown : _tear_down,
    'relay.dest_domains=false' : function (test) {
        test.expect(1);
        var next = function(rc) {
            test.equal(undefined, rc);
            test.done();
        };
        this.plugin.cfg.relay.dest_domains=false;
        this.plugin.dest_domains(next, this.connection, [{host:'foo'}]);
    },
    'relaying' : function (test) {
        test.expect(2);
        var next = function(rc) {
            test.equal(undefined, rc);
            test.equal(1, this.connection.transaction.results.get('relay').skip.length);
            test.done();
        }.bind(this);
        this.connection.relaying=true;
        this.plugin.dest_domains(next, this.connection, [{host:'foo'}]);
    },
    'no config' : function (test) {
        test.expect(2);
        var next = function(rc) {
            test.equal(undefined, rc);
            test.equal(1, this.connection.transaction.results.get('relay').err.length);
            test.done();
        }.bind(this);
        this.plugin.dest_domains(next, this.connection, [{host:'foo'}]);
    },
    'action=undef' : function (test) {
        test.expect(2);
        var next = function(rc) {
            test.equal(DENY, rc);
            test.equal(1, this.connection.transaction.results.get('relay').fail.length);
            test.done();
        }.bind(this);
        this.plugin.dest = { domains: { foo: '{"action":"dunno"}' } };
        this.plugin.dest_domains(next, this.connection, [{host:'foo'}]);
    },
    'action=deny' : function (test) {
        test.expect(2);
        var next = function(rc) {
            test.equal(DENY, rc);
            test.equal(1, this.connection.transaction.results.get('relay').fail.length);
            test.done();
        }.bind(this);
        this.plugin.dest = { domains: { foo: '{"action":"deny"}', } };
        this.plugin.dest_domains(next, this.connection, [{host:'foo'}]);
    },
    'action=continue' : function (test) {
        test.expect(2);
        var next = function(rc) {
            test.equal(CONT, rc);
            test.equal(1, this.connection.transaction.results.get('relay').pass.length);
            test.done();
        }.bind(this);
        this.plugin.dest = { domains: { foo: '{"action":"continue"}', } };
        this.plugin.dest_domains(next, this.connection, [{host:'foo'}]);
    },
    'action=accept' : function (test) {
        test.expect(2);
        var next = function(rc) {
            test.equal(CONT, rc);
            test.equal(1, this.connection.transaction.results.get('relay').pass.length);
            test.done();
        }.bind(this);
        this.plugin.dest = { domains: { foo: '{"action":"continue"}', } };
        this.plugin.dest_domains(next, this.connection, [{host:'foo'}]);
    },
};

exports.force_routing = {
    setUp : function (callback) {
        this.plugin = Plugin('relay');
        this.plugin.config = config;
        this.plugin.cfg = { relay: { force_routing: true } };
        this.plugin.dest = {};

        this.connection = Connection.createConnection();
        this.connection.results = new ResultStore(this.connection);
        this.connection.transaction = {
            results: new ResultStore(this.connection),
        };

        callback();
    },
    tearDown : _tear_down,
    'relay.force_routing=false' : function (test) {
        test.expect(1);
        var next = function(rc) {
            test.equal(undefined, rc);
            test.done();
        };
        this.plugin.cfg.relay.force_routing=false;
        this.plugin.force_routing(next, this.connection, 'foo');
    },
    'dest_domains empty' : function (test) {
        test.expect(1);
        var next = function(rc) {
            test.equal(undefined, rc);
            test.done();
        };
        this.plugin.force_routing(next, this.connection, 'foo');
    },
    'dest_domains, no route' : function (test) {
        test.expect(2);
        var next = function(rc, nexthop) {
            // console.log(arguments);
            test.equal(undefined, rc);
            test.equal(undefined, nexthop);
            test.done();
        };
        this.plugin.dest = { domains: { foo: '{"action":"blah blah"}' } };
        this.plugin.force_routing(next, this.connection, 'foo');
    },
    'dest_domains, route' : function (test) {
        test.expect(2);
        var next = function(rc, nexthop) {
            test.equal(OK, rc);
            test.equal('other-server', nexthop);
            test.done();
        };
        this.plugin.dest = { domains: { foo: '{"action":"blah blah","nexthop":"other-server"}' } };
        this.plugin.force_routing(next, this.connection, 'foo');
    },
};

exports.all = {
    setUp : _set_up,
    tearDown : _tear_down,
    'register_hook() should register available function' : function (test) {
        test.expect(3);
        test.isNotNull(this.plugin.all);
        test.isFunction(this.plugin.all);
        this.plugin.register();
        this.plugin.cfg.relay.all = true;
        this.plugin.register_hook('rcpt', 'all');  // register() doesn't b/c config is disabled
        // console.log(this.plugin.register_hook.args);
        test.equals(this.plugin.register_hook.args[2][1], 'all');
        test.done();
    },
    'all hook always returns OK' : function (test) {
        var next = function (action) {
            test.expect(1);
            test.equals(action, constants.ok);
            test.done();
        };
        this.plugin.cfg.relay = { all: true };
        this.plugin.all(next, this.connection, ['foo@bar.com']);
    },
    'all hook always sets connection.relaying to 1' : function (test) {
        var next = function (action) {
            test.expect(1);
            test.equals(this.connection.relaying, 1);
            test.done();
        }.bind(this);

        this.plugin.cfg.relay = { all: true };
        this.plugin.all(next, this.connection, ['foo@bar.com']);
    }
};
