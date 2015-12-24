'use strict';

var Plugin        = require('../fixtures/stub_plugin');
var config        = require('../../config');

var _set_up_redis = function (done) {

    this.plugin = new Plugin('redis');
    this.plugin.config = config;
    this.plugin.register();

    done();
};

exports.redis = {
    setUp : _set_up_redis,
    'loads' : function (test) {
        test.expect(1);
        test.equal(this.plugin.name, 'redis');
        test.done();
    },
    'config defaults' : function (test) {
        test.expect(2);
        test.equal(this.plugin.cfg.server.host, '127.0.0.1');
        test.equal(this.plugin.cfg.server.port, 6379);
        test.done();
    },
    'pings' : function (test) {
        test.expect(1);
        var server = { notes: { } };
        this.plugin.init_redis_connection(function () {
            test.ok(server.notes.redis);
            test.done();
        }, server);
    },
};

