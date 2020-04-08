
const qfile = require('../../outbound/qfile');

exports.parts = {
    'handles 4': (test) => {
        test.expect(1)
        const r = qfile.parts('1484878079415_0_12345_8888.mta1.example.com')
        // console.log(r);
        delete r.arrival
        delete r.uid
        delete r.counter
        test.deepEqual(r, {
            next_attempt: 1484878079415,
            attempts: 0,
            pid: 12345,
            host: 'mta1.example.com',
            age: 0
        })
        test.done()
    },
    'handles 7': (test) => {
        test.expect(1)
        const r = qfile.parts('1516650518128_1516667073032_8_29538_TkPZWz_1_haraka')
        // console.log(r);
        delete r.age;
        test.deepEqual(r, {
            arrival: 1516650518128,
            next_attempt: 1516667073032,
            attempts: 8,
            pid: 29538,
            uid: 'TkPZWz',
            counter: 1,
            host: 'haraka',
        })
        test.done()
    },
    'punts on 5': (test) => {
        test.expect(1)
        const r = qfile.parts('1516650518128_1516667073032_8_29538_TkPZWz')
        test.deepEqual(r, null)
        test.done()
    },
}

exports.hostname = {
    'hostname, defaults to os.hostname()': test => {
        test.expect(1)
        const r = qfile.hostname();
        // console.log(r)
        test.deepEqual(r, require('os').hostname())
        test.done()
    },
    'hostname, replaces \\ char': test => {
        test.expect(1)
        const r = qfile.hostname('mt\\a1.exam\\ple.com')
        // console.log(r)
        test.deepEqual(r, 'mt\\057a1.exam\\057ple.com')
        test.done()
    },
    'hostname, replaces _ char': test => {
        test.expect(1)
        const r = qfile.hostname('mt_a1.exam_ple.com')
        // console.log(r)
        test.deepEqual(r, 'mt\\137a1.exam\\137ple.com')
        test.done()
    }
}
