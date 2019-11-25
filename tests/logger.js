
const util         = require('util');

function _set_up (callback) {
    this.logger = require('../logger');
    callback();
}
function _tear_down (callback) {
    callback();
}

exports.init = {
    setUp : _set_up,
    tearDown : _tear_down,
    'logger' (test) {
        test.expect(1);
        test.ok(this.logger);
        test.done();
    },
}

exports.log = {
    setUp : _set_up,
    tearDown : _tear_down,
    'log' (test) {
        this.logger.deferred_logs = [];
        test.expect(3);
        test.equal(0, this.logger.deferred_logs.length);
        test.ok(this.logger.log('WARN','test warning'));
        test.equal(1, this.logger.deferred_logs.length);
        test.done();
    },
    'log, w/deferred' (test) {
        test.expect(1);
        this.logger.plugins = { plugin_list: true };
        this.logger.deferred_logs.push( { level: 'INFO', data: 'log test info'} );
        test.ok(this.logger.log('INFO', 'another test info'));
        test.done();
    },
    'log in logfmt' (test) {
        this.logger.deferred_logs = [];
        test.expect(3);
        this.logger.format = this.logger.formats.LOGFMT;
        test.equal(0, this.logger.deferred_logs.length);
        test.ok(this.logger.log('WARN','test warning'));
        test.equal(1, this.logger.deferred_logs.length);
        test.done();
    },
    'log in logfmt w/deferred' (test) {
        test.expect(1);
        this.logger.plugins = { plugin_list: true };
        this.logger.deferred_logs.push( { level: 'INFO', data: 'log test info'} );
        test.ok(this.logger.log('INFO', 'another test info'));
        test.done();
    },
    'log in json' (test) {
        this.logger.deferred_logs = [];
        test.expect(3);
        this.logger.format = this.logger.formats.JSON;
        test.equal(0, this.logger.deferred_logs.length);
        test.ok(this.logger.log('WARN','test warning'));
        test.equal(1, this.logger.deferred_logs.length);
        test.done();
    },
    'log in json w/deferred' (test) {
        test.expect(1);
        this.logger.plugins = { plugin_list: true };
        this.logger.deferred_logs.push( { level: 'INFO', data: 'log test info'} );
        test.ok(this.logger.log('INFO', 'another test info'));
        test.done();
    },
}

exports.level = {
    setUp : _set_up,
    tearDown : _tear_down,
    'both INFO and LOGINFO are log levels' (test) {
        test.expect(2);
        test.equal(this.logger.levels.INFO, 6);
        test.equal(this.logger.levels.LOGINFO, 6);
        test.done();
    },
}

exports.set_format = {
    setUp : _set_up,
    tearDown : _tear_down,
    'set format to DEFAULT' (test) {
        test.expect(1);
        this.logger.format = '';
        this.logger.set_format('DEFAULT');
        test.equal(this.logger.format, this.logger.formats.DEFAULT);
        test.done();
    },
    'set format to LOGFMT' (test) {
        test.expect(1);
        this.logger.format = '';
        this.logger.set_format('LOGFMT');
        test.equal(this.logger.format, this.logger.formats.LOGFMT);
        test.done();
    },
    'set format to JSON' (test) {
        test.expect(1);
        this.logger.format = '';
        this.logger.set_format('JSON');
        test.equal(this.logger.format, this.logger.formats.JSON);
        test.done();
    },
    'set format to DEFAULT if empty' (test) {
        test.expect(1);
        this.logger.format = '';
        this.logger.set_format('');
        test.equal(this.logger.format, this.logger.formats.DEFAULT);
        test.done();
    },
    'set format to DEFAULT if lowercase' (test) {
        test.expect(1);
        this.logger.format = '';
        this.logger.set_format('default');
        test.equal(this.logger.format, this.logger.formats.DEFAULT);
        test.done();
    },
    'set format to DEFAULT if invalid' (test) {
        test.expect(1);
        this.logger.format = '';
        this.logger.set_format('invalid');
        test.equal(this.logger.format, this.logger.formats.DEFAULT);
        test.done();
    },
}

exports.set_loglevel = {
    setUp : _set_up,
    tearDown : _tear_down,
    'set loglevel to LOGINFO' (test) {
        test.expect(1);
        this.logger.set_loglevel('LOGINFO');
        test.equal(this.logger.loglevel, this.logger.levels.LOGINFO);
        test.done();
    },
    'set loglevel to INFO' (test) {
        test.expect(1);
        this.logger.set_loglevel('INFO');
        test.equal(this.logger.loglevel, this.logger.levels.INFO);
        test.done();
    },
    'set loglevel to EMERG' (test) {
        test.expect(1);
        this.logger.set_loglevel('emerg');
        test.equal(this.logger.loglevel, this.logger.levels.EMERG);
        test.done();
    },
    'set loglevel to 6' (test) {
        test.expect(1);
        this.logger.set_loglevel(6);
        test.equal(this.logger.loglevel, 6);
        test.done();
    },
    'set loglevel to WARN if invalid' (test) {
        test.expect(1);
        this.logger.set_loglevel('invalid');
        test.equal(this.logger.loglevel, this.logger.levels.WARN);
        test.done();
    },
}

exports.set_timestamps = {
    setUp : _set_up,
    tearDown : _tear_down,
    'set timestamps to false' (test) {
        test.expect(1);
        this.logger.timestamps = undefined;
        this.logger.set_timestamps(false);
        test.equal(this.logger.timestamps, false);
        test.done();
    },
    'set timestamps to true' (test) {
        test.expect(1);
        this.logger.timestamps = undefined;
        this.logger.set_timestamps(true);
        test.equal(this.logger.timestamps, true);
        test.done();
    },
}

exports.would_log = {
    setUp : _set_up,
    tearDown : _tear_down,
    'should' (test) {
        test.expect(3);
        this.logger.loglevel = 4;
        test.equal(false, this.logger.would_log(7));
        test.equal(false, this.logger.would_log(6));
        test.equal(false, this.logger.would_log(5));
        test.done();
    },
    'should not' (test) {
        test.expect(4);
        this.logger.loglevel = 4;
        test.equal(true, this.logger.would_log(4));
        test.equal(true, this.logger.would_log(3));
        test.equal(true, this.logger.would_log(2));
        test.equal(true, this.logger.would_log(1));
        test.done();
    },
}

exports.log_respond = {
    setUp : _set_up,
    tearDown : _tear_down,
    'invalid retval' (test) {
        test.expect(1);
        test.equal(false, this.logger.log_respond(901));
        test.done();
    },
    'valid retval' (test) {
        test.expect(1);
        const data = { level: 'INFO', data: "test data" };
        test.equal(true, this.logger.log_respond(900, 'test msg', data));
        test.done();
    },
}

exports.dump_logs = {
    setUp : _set_up,
    tearDown : _tear_down,
    'empty' (test) {
        test.expect(1);
        test.ok(this.logger.dump_logs(0));
        test.done();
    },
    'with deferred' (test) {
        test.expect(2);
        this.logger.deferred_logs.push( { level: 'info', data: 'test info'} );
        this.logger.deferred_logs.push( { level: 'INFO', data: 'test info, color'} );
        this.logger.deferred_logs.push( { level: 'WARN', data: 'test warn, color'} );
        test.ok(this.logger.dump_logs(0));
        test.ok(this.logger.deferred_logs.length === 0);
        test.done();
    },
}

exports.colors = {
    setUp : _set_up,
    tearDown : _tear_down,
    'colors' (test) {
        test.expect(1);
        test.ok(this.logger.colors);
        test.done();
    },
    'colorize' (test) {
        test.expect(4);
        test.ok(this.logger.colorize);
        test.equal('function', typeof this.logger.colorize);
        test.equal('error', this.logger.colorize('bad-color', 'error'));
        const expected = util.inspect.colors ? '\u001b[34mgood\u001b[39m' : 'good';
        test.equal(expected, this.logger.colorize('blue', 'good'));
        test.done();
    },
}

exports.log_if_level = {
    setUp : _set_up,
    tearDown : _tear_down,
    'log_if_level is a function' (test) {
        test.expect(1);
        test.ok('function' === typeof this.logger.log_if_level);
        test.done();
    },
    'log_if_level test log entry' (test) {
        test.expect(5);
        this.logger.loglevel = 9;
        const f = this.logger.log_if_level('INFO', 'LOGINFO');
        test.ok(f);
        test.ok('function' === typeof f);
        test.ok(f('test info message'));
        test.equal(1, this.logger.deferred_logs.length);
        // console.log(this.logger.deferred_logs[0]);
        test.equal('INFO', this.logger.deferred_logs[0].level);
        test.done();
    },
    'log_if_level null case' (test) {
        test.expect(2);
        this.logger.loglevel = 9;
        const f = this.logger.log_if_level('INFO', 'LOGINFO');
        test.ok(f(null));
        test.equal(2, this.logger.deferred_logs.length);
        test.done();
    },
    'log_if_level false' (test) {
        test.expect(2);
        this.logger.loglevel = 9;
        const f = this.logger.log_if_level('INFO', 'LOGINFO');
        test.ok(f(false));
        test.equal(3, this.logger.deferred_logs.length);
        test.done();
    },
    'log_if_level 0' (test) {
        test.expect(2);
        this.logger.loglevel = 9;
        const f = this.logger.log_if_level('INFO', 'LOGINFO');
        test.ok(f(0));
        test.equal(4, this.logger.deferred_logs.length);
        test.done();
    },
}

exports.add_log_methods = {
    setUp : _set_up,
    tearDown : _tear_down,
    'ignores non-objects' (test) {
        test.expect(2);
        test.equal(undefined, this.logger.add_log_methods(''));
        test.equal(undefined, this.logger.add_log_methods(function foo (){}));
        test.done();
    },
    'adds functions to an object' (test) {
        const testObj = {};
        this.logger.add_log_methods(testObj);
        const levels = ['DATA','PROTOCOL','DEBUG','INFO','NOTICE','WARN','ERROR','CRIT','ALERT','EMERG'];
        test.expect(levels.length);
        for (let i=0; i<levels.length; i++) {
            test.ok('function' === typeof(testObj[`log${levels[i].toLowerCase()}`]));
        }
        test.done();
    },
}
