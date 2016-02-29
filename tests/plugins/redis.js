'use strict';

var fixtures     = require('haraka-test-fixtures');

var _set_up_redis = function (done) {

    this.plugin = new fixtures.plugin('redis');
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
        test.equal(this.plugin.redisCfg.server.host, '127.0.0.1');
        test.equal(this.plugin.redisCfg.server.port, 6379);
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

