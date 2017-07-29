var constants    = require('haraka-constants');

/*eslint no-unused-vars: ["error", { "varsIgnorePattern": "config" }]*/
var config      = require('./config');
var connection   = require('../connection');

// huge hack here, but plugin tests need constants
constants.import(global);

function _set_up (done) {
    this.backup = {};
    var client = {
        remotePort: null,
        remoteAddress: null,
        destroy: function () { true; },
    };
    var server = {
        ip_address: null,
        address: function () {
            return this.ip_address;
        }
    }
    this.connection = connection.createConnection(client, server);
    done();
}

function _tear_down (done) {
    done();
}

exports.connectionRaw = {
    setUp : _set_up,
    tearDown : _tear_down,
    'has remote object': function (test) {
        test.expect(5);
        test.deepEqual(this.connection.remote, {
            ip: null,
            port: null,
            host: null,
            info: null,
            closed: false,
            is_private: false
        });
        // backwards compat, sunset v3.0.0
        test.equal(this.connection.remote_ip, null);
        test.equal(this.connection.remote_port, null);
        test.equal(this.connection.remote_host, null);
        test.equal(this.connection.remote_info, null);
        test.done();
    },
    'has local object': function (test) {
        test.expect(3);
        test.deepEqual(this.connection.local, {
            ip: null,
            port: null,
            host: null,
        });
        // backwards compat, sunset v3.0.0
        test.equal(this.connection.local_ip, null);
        test.equal(this.connection.local_port, null);
        test.done();
    },
    'has tls object': function (test) {
        test.expect(2);
        test.deepEqual(this.connection.tls, {
            enabled: false,
            advertised: false,
            verified: false,
            cipher: {},
            authorized: null,
        });
        // backwards compat, sunset v3.0.0
        test.equal(this.connection.using_tls, false);
        test.done();
    },
    'get_capabilities' : function (test) {
        test.expect(1);
        test.deepEqual([], this.connection.get_capabilities());
        test.done();
    },
    'queue_msg, defined' : function (test) {
        test.expect(1);
        test.equal(
            'test message',
            this.connection.queue_msg(1, 'test message')
        );
        test.done();
    },
    'queue_msg, default deny' : function (test) {
        test.expect(2);
        test.equal(
            'Message denied',
            this.connection.queue_msg(DENY)
        );
        test.equal(
            'Message denied',
            this.connection.queue_msg(DENYDISCONNECT)
        );
        test.done();
    },
    'queue_msg, default denysoft' : function (test) {
        test.expect(2);
        test.equal(
            'Message denied temporarily',
            this.connection.queue_msg(DENYSOFT)
        );
        test.equal(
            'Message denied temporarily',
            this.connection.queue_msg(DENYSOFTDISCONNECT)
        );
        test.done();
    },
    'queue_msg, default else' : function (test) {
        test.expect(1);
        test.equal('', this.connection.queue_msg('hello'));
        test.done();
    },
    'has legacy connection properties' : function (test) {
        test.expect(4);
        this.connection.set('remote', 'ip', '172.16.15.1');
        this.connection.set('hello', 'verb', 'EHLO');
        this.connection.set('tls', 'enabled', true);

        test.equal('172.16.15.1', this.connection.remote_ip);
        test.equal(null, this.connection.remote_port);
        test.equal('EHLO', this.connection.greeting);
        test.equal(true, this.connection.using_tls);
        test.done();
    },
    'has normalized connection properties' : function (test) {
        test.expect(5);
        this.connection.set('remote', 'ip', '172.16.15.1');
        this.connection.set('hello', 'verb', 'EHLO');
        this.connection.set('tls', 'enabled', true);

        test.equal('172.16.15.1', this.connection.remote.ip);
        test.equal(null, this.connection.remote.port);
        test.equal('EHLO', this.connection.hello.verb);
        test.equal(null, this.connection.hello.host);
        test.equal(true, this.connection.tls.enabled);
        test.done();
    },
    'sets remote.is_private': function (test) {
        test.expect(1);
        test.equal(false, this.connection.remote.is_private);
        test.done();
    },
    'has legacy proxy property set' : function (test) {
        test.expect(1);
        this.connection.set('proxy', 'ip', '172.16.15.1');
        test.equal('172.16.15.1', this.connection.haproxy_ip);
        test.done();
    },
    'has normalized proxy properties, default' : function (test) {
        test.expect(4);
        test.equal(false, this.connection.proxy.allowed);
        test.equal(null, this.connection.proxy.ip);
        test.equal(null, this.connection.proxy.type);
        test.equal(null, this.connection.proxy.timer);
        test.done();
    },
    'has normalized proxy properties, set' : function (test) {
        test.expect(4);
        this.connection.set('proxy', 'ip', '172.16.15.1');
        this.connection.set('proxy', 'type', 'haproxy');
        this.connection.set('proxy', 'timer', setTimeout(function () {}, 1000));
        this.connection.set('proxy', 'allowed', true);

        test.equal(true, this.connection.proxy.allowed);
        test.equal('172.16.15.1', this.connection.proxy.ip);
        test.ok(this.connection.proxy.timer);
        test.equal(this.connection.proxy.type, 'haproxy');
        test.done();
    },
    /*
    'max_data_exceeded_respond' : function (test) {
        test.expect(1);
        test.ok(this.connection.max_data_exceeded_respond(DENYSOFT, 'test' ));
        test.done();
    }
    */
};

exports.connectionPrivate = {
    setUp: function (done) {
        this.backup = {};
        var client = {
            remotePort: 2525,
            remoteAddress: '172.16.15.1',
            destroy: function () { true; },
        };
        var server = {
            ip_address: '172.16.15.254',
            address: function () {
                return this.ip_address;
            }
        }
        this.connection = connection.createConnection(client, server);
        done();
    },
    tearDown : _tear_down,
    'sets remote.is_private': function (test) {
        test.expect(2);
        test.equal(true, this.connection.remote.is_private);
        test.equal(2525, this.connection.remote.port);
        test.done();
    },
}
