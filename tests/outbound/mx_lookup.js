
const mx = require('../../outbound/mx_lookup');

exports.lookup_mx = {
    'MX records for example.com (await)': async test => {
        test.expect(1)
        const r = await mx.lookup_mx('example.com');
        test.deepEqual(r, [ { exchange: '', priority: 0 }])
        test.done()
    },
    'MX records for example.com (cb)': test => {
        test.expect(1)
        mx.lookup_mx('example.com', (err, r) => {
            test.deepEqual(r, [ { exchange: '', priority: 0 }])
            test.done()
        });
    },
    'MX records for tnpi.net (await)': async test => {
        test.expect(1)
        const r = await mx.lookup_mx('tnpi.net');
        test.deepEqual(r, [ { exchange: 'mail.theartfarm.com', priority: 10 }])
        test.done()
    },
    'MX records for tnpi.net (cb)': test => {
        test.expect(1)
        mx.lookup_mx('tnpi.net', (err, r) => {
            test.deepEqual(r, [ { exchange: 'mail.theartfarm.com', priority: 10 }])
            test.done()
        });
    },
    'MX records for gmail.com (await)': async test => {
        test.expect(1)
        const r = await mx.lookup_mx('gmail.com');
        // console.log(r)
        test.ok(r.length)
        test.done()
    },
    'MX records for gmail.com (callback)': test => {
        test.expect(1)
        mx.lookup_mx('gmail.com', (err, r) => {
            test.ok(r.length)
            test.done()
        });
    },
}
