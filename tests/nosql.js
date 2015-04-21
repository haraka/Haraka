'use strict';

var nosql = require('../nosql');

var _set_up_ram = function (done) {
    //console.log('running set_up_ram');
    var self = this;
    self.nosql = nosql;
    self.nosql.cfg.store.backend = undefined;
    delete this.nosql.redis;
    self.nosql.init(function () {
        self.nosql.isCluster = false;
        done();
    });
};

var _set_up_ssc = function (done) {
    // console.log('running set_up_ssc');
    var self = this;
    self.nosql = nosql;
    self.nosql.cfg.store.backend = undefined;
    delete this.nosql.redis;
    self.nosql.init(function (err, connected) {
        done();
    });
};

var _set_up_redis = function (done) {
    // console.log('running set_up_redis');
    var self = this;
    self.nosql = nosql;
    self.nosql.cfg.store.backend = 'redis';
    self.nosql.init(function (err, connected) {
        if (self.nosql.redis_pings) {
            return done();
        }
        delete self.nosql.redis;
        console.log('failing back to memory for tests');
        self.nosql.cfg.store.backend = null;
        // console.log(self.nosql);
        self.nosql.init(done);
    });
};

var setups = [ _set_up_ram, _set_up_ssc, _set_up_redis ];
function get_setup () { return setups.shift(); }

function get_tests () { return {
    setUp : get_setup(),

    'set': function (test) {
        // console.log(this);
        this.nosql.set('foo', 'bar', function (err, result) {
            // console.log(arguments);
            test.expect(2);
            test.ifError(err);
            test.ok(result < 2);
            test.done();
        });
    },
    'get': function (test) {
        var self = this;
        self.nosql.set('foo', 'bar', function (err, result) {
            self.nosql.get('foo', function (err, result) {
                // console.log(arguments);
                test.expect(2);
                test.ifError(err);
                test.equal(result, 'bar');
                test.done();
            });
        });
    },
    'del': function (test) {
        this.nosql.del('foo', function (err, result) {
            // console.log(arguments);
            test.expect(2);
            test.ifError(err);
            test.equal(result, 1);
            test.done();
        });
    },
    'get is null after del': function (test) {
        this.nosql.get('foo', function (err, result) {
            // console.log(arguments);
            test.expect(2);
            test.ifError(err);
            test.equal(result, null);
            test.done();
        });
    },
    'incr, init to incr val': function (test) {
        this.nosql.incrby('foo', 1, function (err, result) {
            // console.log(arguments);
            test.expect(2);
            test.ifError(err);
            test.equal(result, 1);
            test.done();
        });
    },
    'incr, increments': function (test) {
        var self = this;
        self.nosql.set('foo', 1, function (err, result) {
            self.nosql.incrby('foo', 2, function (err, result) {
                self.nosql.incrby('foo', 4, function (err, result) {
                    // console.log(arguments);
                    test.expect(2);
                    test.ifError(err);
                    test.equal(result, 7);
                    test.done();
                });
            });
        });
    },
    'incr, decrements': function (test) {
        var self = this;
        self.nosql.set('foo', 1, function (err, result) {
            self.nosql.incrby('foo', -1, function (err, result) {
                self.nosql.incrby('foo', -2, function (err, result) {
                    // console.log(arguments);
                    test.expect(2);
                    test.ifError(err);
                    test.equal(result, -2);
                    test.done();
                });
            });
        });
    },
    'reset': function (test) {
        this.nosql.reset(function (err, result) {
            // console.log(arguments);
            test.expect(2);
            test.ifError(err);
            test.equal(result, 1);
            test.done();
        });
    },
    'get should be empty after reset': function (test) {
        var self = this;
        self.nosql.set('foo', 'bar', function (err, result) {
            self.nosql.reset(function (err, result) {
                self.nosql.get('foo', function (err, result) {
                    // console.log(arguments);
                    test.expect(2);
                    test.ifError(err);
                    test.equal(result, null);
                    test.done();
                });
            });
        });
    },
};}

['ram','ssc','redis'].forEach(function (setup) {
    exports['lifecycle_' + setup] = get_tests();
});
