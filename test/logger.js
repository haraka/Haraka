const assert = require('node:assert')
const util = require('node:util');

const _set_up = (done) => {
    this.logger = require('../logger');
    done();
}

describe('logger', () => {
    beforeEach(_set_up)

    describe('init', () => {
        it('logger', () => {
            assert.ok(this.logger);
        })
    })

    describe('log', () => {
        it('log', () => {
            this.logger.deferred_logs = [];
            assert.equal(0, this.logger.deferred_logs.length);
            assert.ok(this.logger.log('WARN','test warning'));
            assert.equal(1, this.logger.deferred_logs.length);
        })

        it('log, w/deferred', () => {
            this.logger.plugins = { plugin_list: true };
            this.logger.deferred_logs.push( { level: 'INFO', data: 'log test info'} );
            assert.ok(this.logger.log('INFO', 'another test info'));
        })

        it('log in logfmt', () => {
            this.logger.deferred_logs = [];
            this.logger.format = this.logger.formats.LOGFMT;
            assert.equal(0, this.logger.deferred_logs.length);
            assert.ok(this.logger.log('WARN','test warning'));
            assert.equal(1, this.logger.deferred_logs.length);
        })

        it('log in logfmt w/deferred', () => {
            this.logger.plugins = { plugin_list: true };
            this.logger.deferred_logs.push( { level: 'INFO', data: 'log test info'} );
            assert.ok(this.logger.log('INFO', 'another test info'));
        })

        it('log in json', () => {
            this.logger.deferred_logs = [];
            this.logger.format = this.logger.formats.JSON;
            assert.equal(0, this.logger.deferred_logs.length);
            assert.ok(this.logger.log('WARN','test warning'));
            assert.equal(1, this.logger.deferred_logs.length);
        })

        it('log in json w/deferred', () => {
            this.logger.plugins = { plugin_list: true };
            this.logger.deferred_logs.push( { level: 'INFO', data: 'log test info'} );
            assert.ok(this.logger.log('INFO', 'another test info'));
        })
    })

    describe('level', () => {
        it('both INFO and LOGINFO are log levels', () => {
            assert.equal(this.logger.levels.INFO, 6);
            assert.equal(this.logger.levels.LOGINFO, 6);
        })

    })

    describe('set_format', () => {
        it('set format to DEFAULT', () => {
            this.logger.format = '';
            this.logger.set_format('DEFAULT');
            assert.equal(this.logger.format, this.logger.formats.DEFAULT);
        })

        it('set format to LOGFMT', () => {
            this.logger.format = '';
            this.logger.set_format('LOGFMT');
            assert.equal(this.logger.format, this.logger.formats.LOGFMT);
        })

        it('set format to JSON', () => {
            this.logger.format = '';
            this.logger.set_format('JSON');
            assert.equal(this.logger.format, this.logger.formats.JSON);
        })

        it('set format to DEFAULT if empty', () => {
            this.logger.format = '';
            this.logger.set_format('');
            assert.equal(this.logger.format, this.logger.formats.DEFAULT);
        })

        it('set format to DEFAULT if lowercase', () => {
            this.logger.format = '';
            this.logger.set_format('default');
            assert.equal(this.logger.format, this.logger.formats.DEFAULT);
        })

        it('set format to DEFAULT if invalid', () => {
            this.logger.format = '';
            this.logger.set_format('invalid');
            assert.equal(this.logger.format, this.logger.formats.DEFAULT);
        })

    })

    describe('set_loglevel', () => {
        it('set loglevel to LOGINFO', () => {
            this.logger.set_loglevel('LOGINFO');
            assert.equal(this.logger.loglevel, this.logger.levels.LOGINFO);
        })

        it('set loglevel to INFO', () => {
            this.logger.set_loglevel('INFO');
            assert.equal(this.logger.loglevel, this.logger.levels.INFO);
        })

        it('set loglevel to EMERG', () => {
            this.logger.set_loglevel('emerg');
            assert.equal(this.logger.loglevel, this.logger.levels.EMERG);
        })

        it('set loglevel to 6', () => {
            this.logger.set_loglevel(6);
            assert.equal(this.logger.loglevel, 6);
        })

        it('set loglevel to WARN if invalid', () => {
            this.logger.set_loglevel('invalid');
            assert.equal(this.logger.loglevel, this.logger.levels.WARN);
        })
    })

    describe('set_timestamps', () => {
        it('set timestamps to false', () => {
            this.logger.timestamps = undefined;
            this.logger.set_timestamps(false);
            assert.equal(this.logger.timestamps, false);
        })

        it('set timestamps to true', () => {
            this.logger.timestamps = undefined;
            this.logger.set_timestamps(true);
            assert.equal(this.logger.timestamps, true);
        })
    })

    describe('would_log', () => {
        it('should', () => {
            this.logger.loglevel = 4;
            assert.equal(false, this.logger.would_log(7));
            assert.equal(false, this.logger.would_log(6));
            assert.equal(false, this.logger.would_log(5));
        })

        it('should not', () => {
            this.logger.loglevel = 4;
            assert.equal(true, this.logger.would_log(4));
            assert.equal(true, this.logger.would_log(3));
            assert.equal(true, this.logger.would_log(2));
            assert.equal(true, this.logger.would_log(1));
        })
    })

    describe('log_respond', () => {
        it('invalid retval', () => {
            assert.equal(false, this.logger.log_respond(901));
        })

        it('valid retval', () => {
            const data = { level: 'INFO', data: "test data" };
            assert.equal(true, this.logger.log_respond(900, 'test msg', data));
        })
    })

    describe('dump_logs', () => {
        it('empty', () => {
            assert.ok(this.logger.dump_logs(0));
        })

        it('with deferred', () => {
            this.logger.deferred_logs.push( { level: 'info', data: 'test info'} );
            this.logger.deferred_logs.push( { level: 'INFO', data: 'test info, color'} );
            this.logger.deferred_logs.push( { level: 'WARN', data: 'test warn, color'} );
            assert.ok(this.logger.dump_logs(0));
            assert.ok(this.logger.deferred_logs.length === 0);
        })
    })

    describe('colors', () => {
        it('colors', () => {
            assert.ok(this.logger.colors);
        })

        it('colorize', () => {
            assert.ok(this.logger.colorize);
            assert.equal('function', typeof this.logger.colorize);
            assert.equal('error', this.logger.colorize('bad-color', 'error'));
            const expected = util.inspect.colors ? '\u001b[34mgood\u001b[39m' : 'good';
            assert.equal(expected, this.logger.colorize('blue', 'good'));
        })
    })

    describe('log_if_level', () => {
        it('log_if_level is a function', () => {
            assert.ok('function' === typeof this.logger.log_if_level);
        })

        it('log_if_level test log entry', () => {
            this.logger.loglevel = 9;
            const f = this.logger.log_if_level('INFO', 'LOGINFO');
            assert.ok(f);
            assert.ok('function' === typeof f);
            assert.ok(f('test info message'));
            assert.equal(1, this.logger.deferred_logs.length);
            // console.log(this.logger.deferred_logs[0]);
            assert.equal('INFO', this.logger.deferred_logs[0].level);
        })

        it('log_if_level null case', () => {
            this.logger.loglevel = 9;
            const f = this.logger.log_if_level('INFO', 'LOGINFO');
            assert.ok(f(null));
            assert.equal(2, this.logger.deferred_logs.length);
        })

        it('log_if_level false', () => {
            this.logger.loglevel = 9;
            const f = this.logger.log_if_level('INFO', 'LOGINFO');
            assert.ok(f(false));
            assert.equal(3, this.logger.deferred_logs.length);
        })

        it('log_if_level 0', () => {
            this.logger.loglevel = 9;
            const f = this.logger.log_if_level('INFO', 'LOGINFO');
            assert.ok(f(0));
            assert.equal(4, this.logger.deferred_logs.length);
        })
    })

    describe('add_log_methods', () => {
        it('ignores non-objects', () => {
            assert.equal(undefined, this.logger.add_log_methods(''));
            assert.equal(undefined, this.logger.add_log_methods(function foo (){}));
        })

        it('adds functions to an object', () => {
            const testObj = {};
            this.logger.add_log_methods(testObj);
            const levels = ['DATA','PROTOCOL','DEBUG','INFO','NOTICE','WARN','ERROR','CRIT','ALERT','EMERG'];
            for (const level of levels) {
                assert.ok('function' === typeof(testObj[`log${level.toLowerCase()}`]));
            }
        })
    })
})