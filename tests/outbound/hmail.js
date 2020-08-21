
const fs   = require('fs')
const path = require('path')

const Hmail = require('../../outbound/hmail');
const outbound = require('../../outbound/index');

// const fixtures = path.resolve('tests', 'fixtures');

exports.HMailItem = {
    'normal queue file' (test) {
        test.expect(1);
        this.hmail = new Hmail('1508455115683_1508455115683_0_90253_9Q4o4V_1_haraka', 'tests/queue/1508455115683_1508455115683_0_90253_9Q4o4V_1_haraka', {});
        this.hmail.on('ready', () => {
            // console.log(this.hmail);
            test.ok(this.hmail)
            test.done()
        })
        this.hmail.on('error', err => {
            console.log(err)
            test.equal(err, undefined)
            test.done()
        })
    },
    'normal TODO w/multibyte chars loads w/o error' (test) {
        test.expect(1);
        this.hmail = new Hmail('1507509981169_1507509981169_0_61403_e0Y0Ym_1_qfile', 'tests/fixtures/todo_qfile.txt', {});
        this.hmail.on('ready', () => {
            // console.log(this.hmail);
            test.ok(this.hmail)
            test.done()
        })
        this.hmail.on('error', err => {
            console.log(err)
            test.equal(err, undefined)
            test.done()
        })
    },
    'too short TODO length declared' (test) {
        test.expect(1);
        this.hmail = new Hmail('1507509981169_1507509981169_0_61403_e0Y0Ym_1_haraka', 'tests/queue/1507509981169_1507509981169_0_61403_e0Y0Ym_1_haraka', {});
        this.hmail.on('ready', () => {
            // console.log(this.hmail);
            test.ok(this.hmail)
            test.done();
        })
        this.hmail.on('error', (err) => {
            console.log(err);
            test.ok(err);
            test.done();
        })
    },
    'too long TODO length declared' (test) {
        test.expect(1);
        this.hmail = new Hmail('1508269674999_1508269674999_0_34002_socVUF_1_haraka', 'tests/queue/1508269674999_1508269674999_0_34002_socVUF_1_haraka', {});
        this.hmail.on('ready', () => {
            // console.log(this.hmail);
            test.ok(this.hmail)
            test.done();
        })
        this.hmail.on('error', (err) => {
            console.log(err);
            test.ok(err);
            test.done();
        })
    },
    'zero-length file load skip w/o crash' (test) {
        test.expect(1);
        this.hmail = new Hmail('1507509981169_1507509981169_0_61403_e0Y0Ym_2_zero', 'tests/queue/zero-length', {});
        this.hmail.on('ready', () => {
            test.ok(this.hmail)
            test.done();
        })
        this.hmail.on('error', (err) => {
            console.log(err);
            test.ok(err);
            test.done();
        })
    },
    'lifecycle, reads and writes a haraka queue file' (test) {
        test.expect(1);

        this.hmail = new Hmail('1507509981169_1507509981169_0_61403_e0Y0Ym_2_qfile', 'tests/fixtures/todo_qfile.txt', {});

        this.hmail.on('error', (err) => {
            // console.log(err);
            test.equals(err, undefined);
            test.done();
        })

        this.hmail.on('ready', () => {

            const tmpfile = path.resolve('tests', 'test-queue', 'delete-me');
            const ws = new fs.createWriteStream(tmpfile)

            outbound.build_todo(this.hmail.todo, ws, () => {
                // console.log('returned from build_todo, piping')
                // console.log(this.hmail.todo)
                // test.equals(this.hmail.todo.message_stream.headers.length, 22);

                const ds = this.hmail.data_stream()
                ds.pipe(ws, { line_endings: '\r\n', dot_stuffing: true, ending_dot: false });

                ws.on('close', () => {
                    // console.log(this.hmail.todo)
                    test.equal(fs.statSync(tmpfile).size, 4204);
                    test.done();
                })
            })
        })
    },
}
