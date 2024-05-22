const assert = require('node:assert')

const mock = require('mock-require');
const endpoint = require('../endpoint');

describe('endpoint', () => {

    it('toString()', () => {
        assert.equal( endpoint(25),                         '[::0]:25' );
        assert.equal( endpoint('10.0.0.3', 42),             '10.0.0.3:42' );
        assert.equal( endpoint('/foo/bar.sock'),            '/foo/bar.sock' );
        assert.equal( endpoint('/foo/bar.sock:770'),        '/foo/bar.sock:770' );
        assert.equal( endpoint({address: '::0', port: 80}), '[::0]:80' );
    })

    describe('parse', () => {
        it('Number as port', () => {
            assert.deepEqual( endpoint(25), {host:'::0', port:25} );
        })

        it('Default port if only host', () => {
            assert.deepEqual( endpoint('10.0.0.3', 42), {host:'10.0.0.3', port:42} );
        })

        it('Unix socket', () => {
            assert.deepEqual( endpoint('/foo/bar.sock'), {path:'/foo/bar.sock'} );
        })

        it('Unix socket w/mode', () => {
            assert.deepEqual( endpoint('/foo/bar.sock:770'), {path:'/foo/bar.sock', mode:'770'} );
        })
    })

    describe('bind()', () => {
        beforeEach((done) => {
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
                chmod (path, mode, ...args) {
                    log.push(['chmod', path, mode, ...args]);
                    modes[path] = mode;
                },
                rm (path, ...args) {
                    log.push(['rm', path, ...args]);
                },
            };

            mock('node:fs/promises', this.mockfs);
            this.endpoint = mock.reRequire('../endpoint');
            done();
        })

        afterEach((done) => {
            mock.stop('node:fs/promises');
            done();
        })

        it('IP socket', async () => {
            await this.endpoint('10.0.0.3:42').bind(this.server, {backlog:19});
            assert.deepEqual(
                this.log, [
                    ['listen', {host: '10.0.0.3', port: 42, backlog: 19}],
                ]);
        })

        it('Unix socket', async () => {
            await this.endpoint('/foo/bar.sock').bind(this.server, {readableAll:true});
            assert.deepEqual(
                this.log, [
                    ['rm', '/foo/bar.sock', {force:true}],
                    ['listen', {path: '/foo/bar.sock', readableAll: true}],
                ]);
        })

        it('Unix socket w/mode', async () => {
            await this.endpoint('/foo/bar.sock:764').bind(this.server);
            assert.deepEqual(
                this.log, [
                    ['rm', '/foo/bar.sock', {force:true}],
                    ['listen', {path: '/foo/bar.sock'}],
                    ['chmod', '/foo/bar.sock', 0o764],
                ]);
        })
    })
})
