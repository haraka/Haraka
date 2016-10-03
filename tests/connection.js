var constants    = require('haraka-constants');

/*eslint no-unused-vars: ["error", { "varsIgnorePattern": "config" }]*/
var config      = require('./config');
var connection   = require('../connection');

// huge hack here, but plugin tests need constants
constants.import(global);

function _set_up (callback) {
    this.backup = {};
    var client = {
        destroy: function () { true; }
    };
    this.connection = connection.createConnection(client, {});  // this.server);
    callback();
}

function _tear_down (callback) {
    callback();
}

exports.connection = {
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
            proxy: null,
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
// console.log(this);
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
    /*
    'max_data_exceeded_respond' : function (test) {
        test.expect(1);
        test.ok(this.connection.max_data_exceeded_respond(DENYSOFT, 'test' ));
        test.done();
    }
    */
};
