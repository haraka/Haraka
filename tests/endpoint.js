const mock = require('mock-require');
const endpoint = require('../endpoint');

module.exports = {

    'Endpoint toString()' (test) {
        test.expect(5);
        test.equal( endpoint(25),                         '[::0]:25' );
        test.equal( endpoint('10.0.0.3', 42),             '10.0.0.3:42' );
        test.equal( endpoint('/foo/bar.sock'),            '/foo/bar.sock' );
        test.equal( endpoint('/foo/bar.sock:770'),        '/foo/bar.sock:770' );
        test.equal( endpoint({address: '::0', port: 80}), '[::0]:80' );
        test.done();
    },

    'Endpoint parse': {
        'Number as port' (test) {
            test.expect(1);
            test.deepEqual( endpoint(25), {host:'::0', port:25} );
            test.done();
        },
        'Default port if only host' (test) {
            test.expect(1);
            test.deepEqual( endpoint('10.0.0.3', 42), {host:'10.0.0.3', port:42} );
            test.done();
        },
        'Unix socket' (test) {
            test.expect(1);
            test.deepEqual( endpoint('/foo/bar.sock'), {path:'/foo/bar.sock'} );
            test.done();
        },
        'Unix socket w/mode' (test) {
            test.expect(1);
            test.deepEqual( endpoint('/foo/bar.sock:770'), {path:'/foo/bar.sock', mode:'770'} );
            test.done();
        },
    },

    'Endpoint bind()': {
        setUp (done) {
            // Mock filesystem and log server + fs method calls
            const modes = this.modes = {}
            const log = this.log = []

            this.server = {
                listen (opts, cb) {
                    log.push(['listen', opts]);
                    if (cb) cb();
                }
            }

            this.mockfs = {
                existsSync (path, ...args) {
                    log.push(['existsSync', path, ...args]);
                    return ('undefined' !== typeof modes[path]);
                },
                chmodSync (path, mode, ...args) {
                    log.push(['chmodSync', path, mode, ...args]);
                    modes[path] = mode;
                },
                unlinkSync (path, ...args) {
                    log.push(['unlinkSync', path, ...args]);
                    if ('undefined' !== typeof modes[path]) {
                        delete modes[path];
                    }
                    else {
                        log.push(['unlink without existing socket']);
                    }
                },
            };

            mock('fs', this.mockfs);
            this.endpoint = mock.reRequire('../endpoint');
            done();
        },

        tearDown (done) {
            mock.stop('fs');
            done();
        },

        'IP socket' (test) {
            test.expect(1);
            this.endpoint('10.0.0.3:42').bind(this.server, {backlog:19});
            test.deepEqual(
                this.log, [
                    ['listen', {host: '10.0.0.3', port: 42, backlog: 19}],
                ]);
            test.done();
        },

        'Unix socket' (test) {
            test.expect(1);
            this.endpoint('/foo/bar.sock').bind(this.server, {readableAll:true});
            test.deepEqual(
                this.log, [
                    ['existsSync', '/foo/bar.sock'],
                    ['listen', {path: '/foo/bar.sock', readableAll: true}],
                ]);
            test.done();
        },

        'Unix socket (pre-existing)' (test) {
            test.expect(1);
            this.modes['/foo/bar.sock'] = 0o755;
            this.endpoint('/foo/bar.sock').bind(this.server);
            test.deepEqual(
                this.log, [
                    ['existsSync', '/foo/bar.sock'],
                    ['unlinkSync', '/foo/bar.sock'],
                    ['listen', {path: '/foo/bar.sock'}],
                ]);
            test.done();
        },

        'Unix socket w/mode' (test) {
            test.expect(1);
            this.endpoint('/foo/bar.sock:764').bind(this.server);
            test.deepEqual(
                this.log, [
                    ['existsSync', '/foo/bar.sock'],
                    ['listen', {path: '/foo/bar.sock'}],
                    ['chmodSync', '/foo/bar.sock', 0o764],
                ]);
            test.done();
        },
    },
}
