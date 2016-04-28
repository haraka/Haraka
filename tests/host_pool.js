"use strict";

var HostPool = require('../host_pool');

exports.HostPool = {
    "get a host": function (test) {
        test.expect(2);

        var pool = new HostPool('1.1.1.1:1111, 2.2.2.2:2222');

        var host = pool.get_host();

        test.ok( /\d\.\d\.\d\.\d/.test(host.host),
                "'" + host.host + "' looks like a IP");
        test.ok( /\d\d\d\d/.test(host.port),
                "'" + host.port + "' looks like a port");

        test.done();
    },
    "uses all the list": function (test) {
        test.expect(3);

        var pool = new HostPool('1.1.1.1:1111, 2.2.2.2:2222');

        var host1 = pool.get_host();
        var host2 = pool.get_host();
        var host3 = pool.get_host();

        test.notEqual(host1.host, host2.host);
        test.notEqual(host3.host, host2.host);
        test.equal(host3.host, host1.host);

        test.done();
    },
    "default port 25 ": function (test) {
        test.expect(2);

        var pool = new HostPool('1.1.1.1, 2.2.2.2');

        var host1 = pool.get_host();
        var host2 = pool.get_host();

        test.equal(host1.port, 25, "is port 25: " + host1.port);
        test.equal(host2.port, 25, "is port 25: " + host2.port);

        test.done();
    },

    "dead host": function(test){
        test.expect(3);

        var pool = new HostPool('1.1.1.1:1111, 2.2.2.2:2222');

        pool.failed('1.1.1.1', '1111');

        var host;

        host = pool.get_host();
        test.equal(host.host, '2.2.2.2', 'dead host is not returned');
        host = pool.get_host();
        test.equal(host.host, '2.2.2.2', 'dead host is not returned');
        host = pool.get_host();
        test.equal(host.host, '2.2.2.2', 'dead host is not returned');

        test.done();
    },

    // if they're *all* dead, we return a host to try anyway, to keep from
    // accidentally DOS'ing ourselves if there's a transient but widespread
    // network outage
    "they're all dead": function(test){
        test.expect(6);

        var host1;
        var host2;

        var pool = new HostPool('1.1.1.1:1111, 2.2.2.2:2222');

        host1 = pool.get_host();

        pool.failed('1.1.1.1', '1111');
        pool.failed('2.2.2.2', '2222');

        host2 = pool.get_host();
        test.ok (host2, "if they're all dead, try one anyway");
        test.notEqual(host1.host, host2.host, "rotation continues");

        host1 = pool.get_host();
        test.ok (host1, "if they're all dead, try one anyway");
        test.notEqual(host1.host, host2.host, "rotation continues");

        host2 = pool.get_host();
        test.ok (host2, "if they're all dead, try one anyway");
        test.notEqual(host1.host, host2.host, "rotation continues");

        test.done();
    },


    // after .01 secs the timer to retry the dead host will fire, and then
    // we connect using this mock socket, whose "connect" always succeeds
    // so the code brings the dead host back to life
    "host dead checking timer": function (test){
        test.expect(2);

        var num_reqs = 0;
        var MockSocket = function MockSocket(pool) {
            var self = this;

            // these are the methods called from probe_dead_host

            // setTimeout on the socket
            self.pretendTimeout = function(){};
            self.setTimeout = function(ms, cb){
                self.pretendTimeout = cb;
            };
            // handle socket.on('error', ....
            self.listeners = {};
            self.on = function(eventname, cb){
                self.listeners[eventname] = cb;
            };
            self.emit = function(eventname){
                self.listeners[eventname]();
            };
            // handle socket.connect(...
            self.connected = function() {};
            self.connect = function(port, host, cb){
                switch (++num_reqs){
                    case 1:
                        // the first time through we pretend it timed out
                        self.pretendTimeout();
                        break;
                    case 2:
                        // the second time through, pretend socket error
                        self.emit('error');
                        break;
                    case 3:
                        // the third time around, the socket connected
                        cb();
                        break;
                    default:
                        // failsafe
                        console.log("num_reqs hit " + num_reqs + ", wtf?");
                        process.exit(1);
                }
            };
            self.destroy = function(){};

        };

        var retry_secs = 0.001; // 1ms
        var pool = new HostPool('1.1.1.1:1111, 2.2.2.2:2222', retry_secs);

        // override the pool's get_socket method to return our mock
        pool.get_socket = function(){ return new MockSocket(pool); };

        // mark the host as failed and start up the retry timers
        pool.failed('1.1.1.1', '1111');

        test.ok(pool.dead_hosts["1.1.1.1:1111"], 'yes it was marked dead');

        // probe_dead_host() will hit two failures and one success (based on
        // num_reqs above). So we wait 3xretry_secs and triple it for
        // some headroom.
        setTimeout(function(){
            test.ok(! pool.dead_hosts["1.1.1.1:1111"],
                    'timer un-deaded it'
               );
            test.done();
        }, retry_secs * 1000 * 3 * 3 );

    }

};
