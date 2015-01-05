// var stub      = require('./fixtures/stub');
// var constants = require('./../constants');
// var Logger    = require('./fixtures/stub_logger');
// var utils     = require('./../utils');

function _set_up(done) {
    this.server = require('../server');

    done();
}

function _tear_down(done) {
    done();
}

exports.get_listen_addrs = {
    setUp : _set_up,
    tearDown : _tear_down,
    'IPv4 fully qualified' : function (test) {
        test.expect(1);
        var listeners = this.server.get_listen_addrs({listen: '127.0.0.1:25'});
        test.deepEqual(['127.0.0.1:25'], listeners);
        test.done();
    },
    'IPv4, default port' : function (test) {
        test.expect(1);
        var listeners = this.server.get_listen_addrs({listen: '127.0.0.1'});
        test.deepEqual(['127.0.0.1:25'], listeners);
        test.done();
    },
    'IPv4, custom port' : function (test) {
        test.expect(1);
        var listeners = this.server.get_listen_addrs({listen: '127.0.0.1'}, 250);
        test.deepEqual(['127.0.0.1:250'], listeners);
        test.done();
    },
    'IPv6 fully qualified' : function (test) {
        test.expect(1);
        var listeners = this.server.get_listen_addrs({listen: '[::1]:25'});
        test.deepEqual(['[::1]:25'], listeners);
        test.done();
    },
    'IPv6, default port' : function (test) {
        test.expect(1);
        var listeners = this.server.get_listen_addrs({listen: '[::1]'});
        test.deepEqual(['[::1]:25'], listeners);
        test.done();
    },
    'IPv6, custom port' : function (test) {
        test.expect(1);
        var listeners = this.server.get_listen_addrs({listen: '[::1]'}, 250);
        test.deepEqual(['[::1]:250'], listeners);
        test.done();
    },
    'IPv4 & IPv6 fully qualified' : function (test) {
        test.expect(1);
        var listeners = this.server.get_listen_addrs({listen: '127.0.0.1:25,[::1]:25'});
        test.deepEqual(['127.0.0.1:25','[::1]:25'], listeners);
        test.done();
    },
    'IPv4 & IPv6, default port' : function (test) {
        test.expect(1);
        var listeners = this.server.get_listen_addrs({listen: '127.0.0.1:25,[::1]'});
        test.deepEqual(['127.0.0.1:25','[::1]:25'], listeners);
        test.done();
    },
    'IPv4 & IPv6, custom port' : function (test) {
        test.expect(1);
        var listeners = this.server.get_listen_addrs({listen: '127.0.0.1,[::1]'}, 250);
        test.deepEqual(['127.0.0.1:250','[::1]:250'], listeners);
        test.done();
    },
};

exports.load_smtp_ini = {
    setUp : _set_up,
    'saves settings to Server.cfg': function (test) {
        test.expect(3);
        this.server.load_smtp_ini();
        // console.log(this.server.cfg);
        var c = this.server.cfg.main;
        test.notEqual(c.daemonize, undefined);
        test.notEqual(c.daemon_log_file, undefined);
        test.notEqual(c.daemon_pid_file, undefined);
        test.done();
    }
};

exports.get_smtp_server = {
    setUp : _set_up,
    tearDown : _tear_down,
    'gets a net server object': function (test) {
        var server;
        try { server = this.server.get_smtp_server('127.0.0.1', 2500, 10); }
        catch (ignore) {
            test.done();
            return;
        }
        if (!server) {   // can't bind to IP/port (fails on Travis)
            test.expect(0);
            test.done();
            return;
        }
        test.expect(2);
        test.ok(server);
        try {
            server.getConnections(function (err, count) {
                test.equal(0, count);
                test.done();
            });
        }
        catch (ignore) {
            // node 0.8 doesn't have getConnections()
            test.equal(0, server.connections);
            test.done();
        }
    },
};
