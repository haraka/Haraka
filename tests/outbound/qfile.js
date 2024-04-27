const assert = require('node:assert')
const os   = require('node:os');

describe('qfile', () => {

    describe('qfile', () => {
        beforeEach((done) => {
            this.qfile = require('../../outbound/qfile')
            done();
        })

        it('name() basic functions', () => {
            const name = this.qfile.name();
            const split = name.split('_');
            assert.equal(split.length, 7);
            assert.equal(split[2], 0);
            assert.equal(split[3], process.pid);
        })

        it('name() with overrides', () => {
            const overrides = {
                arrival : 12345,
                next_attempt : 12345,
                attempts : 15,
                pid : process.pid,
                uid : 'XXYYZZ',
                host : os.hostname(),
            };
            const name = this.qfile.name(overrides);
            const split = name.split('_');
            assert.equal(split.length, 7);
            assert.equal(split[0], overrides.arrival);
            assert.equal(split[1], overrides.next_attempt);
            assert.equal(split[2], overrides.attempts);
            assert.equal(split[3], overrides.pid);
            assert.equal(split[4], overrides.uid);
            assert.equal(split[6], overrides.host);
        })

        it('rnd_unique() is unique-ish', () => {
            const repeats = 1000;
            const u = this.qfile.rnd_unique();
            for (let i = 0; i < repeats; i++){
                assert.notEqual(u, this.qfile.rnd_unique());
            }
        })
    })

    describe('parts', () => {

        it('parts() updates previous queue filenames', () => {
            // $nextattempt_$attempts_$pid_$uniq.$host
            const name = "1111_0_2222_3333.foo.example.com"
            const parts = this.qfile.parts(name);
            assert.equal(parts.next_attempt, 1111);
            assert.equal(parts.attempts, 0);
            assert.equal(parts.pid, 2222);
            assert.equal(parts.host, 'foo.example.com');
        })

        it('parts() handles standard queue filenames', () => {
            const overrides = {
                arrival : 12345,
                next_attempt : 12345,
                attempts : 15,
                pid : process.pid,
                uid : 'XXYYZZ',
                host : os.hostname(),
            };
            const name = this.qfile.name(overrides);
            const parts = this.qfile.parts(name);
            assert.equal(parts.arrival, overrides.arrival);
            assert.equal(parts.next_attempt, overrides.next_attempt);
            assert.equal(parts.attempts, overrides.attempts);
            assert.equal(parts.pid, overrides.pid);
            assert.equal(parts.uid, overrides.uid);
            assert.equal(parts.host, overrides.host);
        })

        it('handles 4', () => {
            const r = this.qfile.parts('1484878079415_0_12345_8888.mta1.example.com')
            delete r.arrival
            delete r.uid
            delete r.counter
            assert.deepEqual(r, {
                next_attempt: 1484878079415,
                attempts: 0,
                pid: 12345,
                host: 'mta1.example.com',
                age: 0
            })
        })

        it('handles 7', () => {
            const r = this.qfile.parts('1516650518128_1516667073032_8_29538_TkPZWz_1_haraka')
            delete r.age;
            assert.deepEqual(r, {
                arrival: 1516650518128,
                next_attempt: 1516667073032,
                attempts: 8,
                pid: 29538,
                uid: 'TkPZWz',
                counter: 1,
                host: 'haraka',
            })
        })

        it('punts on 5', () => {
            assert.deepEqual(this.qfile.parts('1516650518128_1516667073032_8_29538_TkPZWz'), null)
        })
    })

    describe('hostname', () => {
        it('hostname, defaults to os.hostname()', () => {
            assert.deepEqual(this.qfile.hostname(), require('os').hostname())
        })

        it('hostname, replaces \\ char', () => {
            assert.deepEqual(this.qfile.hostname('mt\\a1.exam\\ple.com'), 'mt\\057a1.exam\\057ple.com')
        })

        it('hostname, replaces _ char', () => {
            assert.deepEqual(this.qfile.hostname('mt_a1.exam_ple.com'), 'mt\\137a1.exam\\137ple.com')
        })
    })
})