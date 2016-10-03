var constants    = require('haraka-constants');

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
