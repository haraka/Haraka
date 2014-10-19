var stub         = require('./fixtures/stub'),
    Plugin       = require('./fixtures/stub_plugin'),
    Connection   = require('./fixtures/stub_connection'),
    configfile   = require('../configfile'),
    config       = require('../config'),
    util         = require('util');

function _set_up(callback) {
    // this.connection = Connection.createConnection();
    // this.connection.results = new ResultStore(this.connection);
    this.logger = require('../logger');
    callback();
}
function _tear_down(callback) {
    callback();
}

exports.init = {
    setUp : _set_up,
    tearDown : _tear_down,
    'logger' : function (test) {
        test.expect(1);
        test.ok(this.logger);
        test.done();
    },
};

exports.log = {
    setUp : _set_up,
    tearDown : _tear_down,
    'log' : function (test) {
        this.logger.deferred_logs = [];
        test.expect(3);
        test.equal(0, this.logger.deferred_logs.length);
        test.ok(this.logger.log('WARN','test warning'));
        test.equal(1, this.logger.deferred_logs.length);
        test.done();
    },
    'log, w/deferred' : function (test) {
        test.expect(1);
        this.logger.plugins = { plugin_list: true };
        this.logger.deferred_logs.push( { level: 'INFO', data: 'log test info'} );
        test.ok(this.logger.log('INFO', 'another test info'));
        test.done();
    },
};

exports.would_log = {
    setUp : _set_up,
    tearDown : _tear_down,
    'should' : function (test) {
        test.expect(3);
        this.logger.loglevel = 4;
        test.equal(false, this.logger.would_log(7));
        test.equal(false, this.logger.would_log(6));
        test.equal(false, this.logger.would_log(5));
        test.done();
    },
    'should not' : function (test) {
        test.expect(4);
        this.logger.loglevel = 4;
        test.equal(true, this.logger.would_log(4));
        test.equal(true, this.logger.would_log(3));
        test.equal(true, this.logger.would_log(2));
        test.equal(true, this.logger.would_log(1));
        test.done();
    },
};

exports.log_respond = {
    setUp : _set_up,
    tearDown : _tear_down,
    'invalid retval' : function (test) {
        test.expect(1);
        test.equal(false, this.logger.log_respond(901));
        test.done();
    },
    'valid retval' : function (test) {
        test.expect(1);
        var data = { level: 'INFO', data: "test data" };
        test.equal(true, this.logger.log_respond(900, 'test msg', data));
        test.done();
    },
};

exports.dump_logs = {
    setUp : _set_up,
    tearDown : _tear_down,
    'empty' : function (test) {
        test.expect(1);
        test.ok(this.logger.dump_logs(0));
        test.done();
    },
    'with deferred' : function (test) {
        test.expect(2);
        this.logger.deferred_logs.push( { level: 'info', data: 'test info'} );
        this.logger.deferred_logs.push( { level: 'INFO', data: 'test info, color'} );
        this.logger.deferred_logs.push( { level: 'WARN', data: 'test warn, color'} );
        test.ok(this.logger.dump_logs(0));
        test.ok(this.logger.deferred_logs.length === 0);
        test.done();
    },
};

exports.colors = {
    setUp : _set_up,
    tearDown : _tear_down,
    'colors' : function (test) {
        test.expect(1);
        test.ok(this.logger.colors);
        test.done();
    },
    'colorize' : function (test) {
        test.expect(4);
        test.ok(this.logger.colorize);
        test.equal('function', typeof this.logger.colorize);
        // missing on Node < 0.10
        test.equal('error', this.logger.colorize('bad-color', 'error'));
        var expected = util.inspect.colors ? '\u001b[34mgood\u001b[39m' : 'good';
        test.equal(expected, this.logger.colorize('blue', 'good'));
        test.done();
    },
};

exports.log_if_level = {
    setUp : _set_up,
    tearDown : _tear_down,
    'log_if_level is a function' : function (test) {
        test.expect(1);
        test.ok('function' === typeof(this.logger.log_if_level));
        test.done();
    },
    'log_if_level test log entry' : function (test) {
        test.expect(5);
        this.logger.loglevel = 9;
        var f = this.logger.log_if_level('INFO', 'LOGINFO');
        test.ok(f);
        test.ok('function' === typeof(f));
        test.ok(f("test info message"));
        test.equal(1, this.logger.deferred_logs.length);
        // console.log(this.logger.deferred_logs[0]);
        test.equal('INFO', this.logger.deferred_logs[0].level);
        test.done();
    },
};

exports.add_log_methods = {
    setUp : _set_up,
    tearDown : _tear_down,
    'ignores non-objects' : function (test) {
        test.expect(2);
        test.equal(undefined, this.logger.add_log_methods(''));
        test.equal(undefined, this.logger.add_log_methods(function foo(){}));
        test.done();
    },
    'adds functions to an object' : function (test) {
        var testObj = {};
        this.logger.add_log_methods(testObj);
        var levels = ['DATA','PROTOCOL','DEBUG','INFO','NOTICE','WARN','ERROR','CRIT','ALERT','EMERG'];
        test.expect(levels.length);
        for (var i=0; i<levels.length; i++) {
            test.ok('function' === typeof(testObj['log'+levels[i].toLowerCase()]));
        }
        test.done();
    },
};
