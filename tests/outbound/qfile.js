const assert = require('node:assert')

const qfile = require('../../outbound/qfile');

describe('parts', () => {

    it('handles 4', () => {
        const r = qfile.parts('1484878079415_0_12345_8888.mta1.example.com')
        // console.log(r);
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
        const r = qfile.parts('1516650518128_1516667073032_8_29538_TkPZWz_1_haraka')
        // console.log(r);
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
        const r = qfile.parts('1516650518128_1516667073032_8_29538_TkPZWz')
        assert.deepEqual(r, null)
    })
})

describe('hostname', () => {
    it('hostname, defaults to os.hostname()', () => {
        const r = qfile.hostname();
        // console.log(r)
        assert.deepEqual(r, require('os').hostname())
    })

    it('hostname, replaces \\ char', () => {
        const r = qfile.hostname('mt\\a1.exam\\ple.com')
        // console.log(r)
        assert.deepEqual(r, 'mt\\057a1.exam\\057ple.com')
    })

    it('hostname, replaces _ char', () => {
        const r = qfile.hostname('mt_a1.exam_ple.com')
        // console.log(r)
        assert.deepEqual(r, 'mt\\137a1.exam\\137ple.com')
    })
})
