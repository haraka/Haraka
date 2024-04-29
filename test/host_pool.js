"use strict";

const assert = require('node:assert')

const HostPool = require('../host_pool');

describe('HostPool', () => {
    it("get a host", (done) => {

        const pool = new HostPool('1.1.1.1:1111, 2.2.2.2:2222');
        const host = pool.get_host();

        assert.ok( /\d\.\d\.\d\.\d/.test(host.host), `'${host.host}' looks like a IP`);
        assert.ok( /\d\d\d\d/.test(host.port), `'${host.port}' looks like a port`);
        done()
    })

    it("uses all the list", (done) => {

        const pool = new HostPool('1.1.1.1:1111, 2.2.2.2:2222');

        const host1 = pool.get_host();
        const host2 = pool.get_host();
        const host3 = pool.get_host();

        assert.notEqual(host1.host, host2.host);
        assert.notEqual(host3.host, host2.host);
        assert.equal(host3.host, host1.host);
        done()
    })

    it("default port 25", (done) => {
        const pool = new HostPool('1.1.1.1, 2.2.2.2');

        const host1 = pool.get_host();
        const host2 = pool.get_host();

        assert.equal(host1.port, 25, `is port 25: ${host1.port}`);
        assert.equal(host2.port, 25, `is port 25: ${host2.port}`);
        done()
    })

    it("dead host", (done) => {
        const pool = new HostPool('1.1.1.1:1111, 2.2.2.2:2222');

        pool.failed('1.1.1.1', '1111');

        let host;

        host = pool.get_host();
        assert.equal(host.host, '2.2.2.2', 'dead host is not returned');
        host = pool.get_host();
        assert.equal(host.host, '2.2.2.2', 'dead host is not returned');
        host = pool.get_host();
        assert.equal(host.host, '2.2.2.2', 'dead host is not returned');
        done()
    })

    // if they're *all* dead, we return a host to try anyway, to keep from
    // accidentally DOS'ing ourselves if there's a transient but widespread
    // network outage
    it("they're all dead", (done) => {

        let host1;
        let host2;

        const pool = new HostPool('1.1.1.1:1111, 2.2.2.2:2222');

        host1 = pool.get_host();

        pool.failed('1.1.1.1', '1111');
        pool.failed('2.2.2.2', '2222');

        host2 = pool.get_host();
        assert.ok (host2, "if they're all dead, try one anyway");
        assert.notEqual(host1.host, host2.host, "rotation continues");

        host1 = pool.get_host();
        assert.ok (host1, "if they're all dead, try one anyway");
        assert.notEqual(host1.host, host2.host, "rotation continues");

        host2 = pool.get_host();
        assert.ok (host2, "if they're all dead, try one anyway");
        assert.notEqual(host1.host, host2.host, "rotation continues");
        done()
    })

    // after .01 secs the timer to retry the dead host will fire, and then
    // we connect using this mock socket, whose "connect" always succeeds
    // so the code brings the dead host back to life
    it("host dead checking timer", (done) => {

        let num_reqs = 0;
        const MockSocket = function MockSocket (pool) {

            // these are the methods called from probe_dead_host

            // setTimeout on the socket
            this.pretendTimeout = () => {};
            this.setTimeout = (ms, cb) => {
                this.pretendTimeout = cb;
            };
            // handle socket.on('error', ....
            this.listeners = {};
            this.on = (eventname, cb) => {
                this.listeners[eventname] = cb;
            };
            this.emit = eventname => {
                this.listeners[eventname]();
            };
            // handle socket.connect(...
            this.connected = () => {};
            this.connect = (port, host, cb) => {
                switch (++num_reqs) {
                    case 1:
                        // the first time through we pretend it timed out
                        this.pretendTimeout();
                        break;
                    case 2:
                        // the second time through, pretend socket error
                        this.emit('error');
                        break;
                    case 3:
                        // the third time around, the socket connected
                        cb();
                        break;
                    default:
                        // failsafe
                        console.log(`num_reqs hit ${num_reqs}, wtf?`);
                        process.exit(1);
                }
            };
            this.destroy = () => {};
        };

        const retry_secs = 0.001; // 1ms
        const pool = new HostPool('1.1.1.1:1111, 2.2.2.2:2222', retry_secs);

        // override the pool's get_socket method to return our mock
        pool.get_socket = () => new MockSocket (pool);

        // mark the host as failed and start up the retry timers
        pool.failed('1.1.1.1', '1111');

        assert.ok(pool.dead_hosts["1.1.1.1:1111"], 'yes it was marked dead');

        // probe_dead_host() will hit two failures and one success (based on
        // num_reqs above). So we wait at least 10s for that to happen:
        const timer = setTimeout(() => {
            clearInterval(interval);
            assert.ok(false, 'probe_dead_host failed');
            done()
        }, 10 * 1000);

        const interval = setInterval(() => {
            if (!pool.dead_hosts["1.1.1.1:1111"]) {
                clearTimeout(timer);
                clearInterval(interval);
                assert.ok(true, 'timer un-deaded it');
                done()
            }
        }, retry_secs * 1000 * 3 );
    })
})
