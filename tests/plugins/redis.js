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
    'connects' : function (test) {
        test.expect(1);
        var opts = {
            host: this.plugin.redisCfg.server.host,
            port: this.plugin.redisCfg.server.port,
            retry_strategy: function (options) {
                if (options.error) {
                    console.error(options.error);
                }
                return undefined;
            }
        };
        var redis = this.plugin.get_redis_client(opts, function () {
            test.ok(redis.connected);
            test.done();
        });
    },
};
