var stub             = require('../fixtures/stub'),
    constants        = require('../../constants'),
    Logger           = require('../fixtures/stub_logger'),
    Plugin           = require('../fixtures/stub_plugin');

// huge hack here, but plugin tests need constants
constants.import(global);

function _set_up(callback) {
    this.backup = {};

    // needed for tests
    this.plugin = new Plugin('log.syslog');
    this.logger = Logger.createLogger();

    // backup modifications
    this.backup.plugin = {};
    this.backup.plugin.Syslog = {};

    // stub out functions
    this.log = stub();
    this.log.level = 'info';
    this.log.data = "this is a test log message";

    // some test data
    this.configfile = {
        general : {
            name : 'haraka',
            facility : 'MAIL',
            log_pid : 1,
            log_odelay : 1,
            log_cons : 0,
            log_ndelay : false,
            log_nowait : 'random',
            always_ok : false
        }
    };
    this.plugin.config.get = function (file) {
        return this.configfile;
    }.bind(this);

    callback();
}

function _tear_down(callback) {
    callback();
}

exports.log_syslog = {
    setUp : _set_up,
    tearDown : _tear_down,
    'should have register function' : function (test) {
        test.expect(2);
        test.isNotNull(this.plugin);
        test.isFunction(this.plugin.register);
        test.done();
    },
    'register function should call register_hook()' : function (test) {
        this.plugin.register();
        test.expect(1);
        test.ok(this.plugin.register_hook.called);
        test.done();
    },
    'register_hook() should register for propper hook' : function (test) {
        this.plugin.register();
        test.expect(1);
        test.equals(this.plugin.register_hook.args[0], 'log');
        test.done();
    },
    'register_hook() should register available function' : function (test) {
        this.plugin.register();
        test.expect(3);
        test.equals(this.plugin.register_hook.args[1], 'syslog');
        test.isNotNull(this.plugin.syslog);
        test.isFunction(this.plugin.syslog);
        test.done();
    },
    'register calls Syslog.init()' : function (test) {
        // local setup
        this.backup.plugin.Syslog.init = this.plugin.Syslog.init;
        this.plugin.Syslog.init = stub();
        this.plugin.register();

        test.expect(1);
        test.ok(this.plugin.Syslog.init.called);
        test.done();

        // local teardown
        this.plugin.Syslog.init = this.backup.plugin.Syslog.init;
    },
    'register calls Syslog.init() with correct args' : function (test) {
        // local setup
        this.backup.plugin.Syslog.init = this.plugin.Syslog.init;
        this.plugin.Syslog.init = stub();
        this.plugin.register();

        test.expect(4);
        test.ok(this.plugin.Syslog.init.called);
        test.equals(this.plugin.Syslog.init.args[0],
            this.plugin.config.get("test").general.name);
        test.equals(this.plugin.Syslog.init.args[1],
            this.plugin.Syslog.LOG_PID | this.plugin.Syslog.LOG_ODELAY);
        test.equals(this.plugin.Syslog.init.args[2],
            this.plugin.Syslog.LOG_MAIL);
        test.done();

        // local teardown
        this.plugin.Syslog.init = this.backup.plugin.Syslog.init;
    },
    'hook returns just next() by default (missing always_ok)' : function (test) {
        var next = function (action) {
            test.expect(1);
            test.isUndefined(action);
            test.done();
        };

        this.plugin.syslog(next, this.logger, this.log);
    },
    'hook returns just next() if always_ok is false' : function (test) {
        // local setup
        this.backup.configfile = this.configfile;
        this.configfile.general.always_ok = 'false';
        this.plugin.register();

        var next = function (action) {
            test.expect(1);
            test.isUndefined(action);
            test.done();
        };

        this.plugin.syslog(next, this.logger, this.log);
    },
    'hook returns next(OK) if always_ok is true' : function (test) {
        // local setup
        this.backup.configfile = this.configfile;
        this.configfile.general.always_ok = 'true';
        this.plugin.register();

        var next = function (action) {
            test.expect(1);
            test.equals(action, constants.ok);
            test.done();
        };

        this.plugin.syslog(next, this.logger, this.log);

        // local teardown
        this.configfile = this.backup.configfile;
    },
    'hook returns just next() if always_ok is 0' : function (test) {
        // local setup
        this.backup.configfile = this.configfile;
        this.configfile.general.always_ok = 0;
        this.plugin.register();

        var next = function (action) {
            test.expect(1);
            test.isUndefined(action);
            test.done();
        };

        this.plugin.syslog(next, this.logger, this.log);
    },
    'hook returns next(OK) if always_ok is 1' : function (test) {
        // local setup
        this.backup.configfile = this.configfile;
        this.configfile.general.always_ok = 1;
        this.plugin.register();

        var next = function (action) {
            test.expect(1);
            test.equals(action, constants.ok);
            test.done();
        };

        this.plugin.syslog(next, this.logger, this.log);

        // local teardown
        this.configfile = this.backup.configfile;
    },
    'hook returns next() if always_ok is random' : function (test) {
        // local setup
        this.backup.configfile = this.configfile;
        this.configfile.general.always_ok = 'random';
        this.plugin.register();

        var next = function (action) {
            test.expect(1);
            test.isUndefined(action);
            test.done();
        };

        this.plugin.syslog(next, this.logger, this.log);

        // local teardown
        this.configfile = this.backup.configfile;
    },
    'syslog hook logs correct thing' : function (test) {
        // local setup
        var next = stub();
        this.backup.plugin.Syslog.log = this.plugin.Syslog.log;
        this.plugin.Syslog.log = stub();
        this.plugin.syslog(next, this.logger, this.log);

        test.expect(3);
        test.ok(this.plugin.Syslog.log.called);
        test.equals(this.plugin.Syslog.log.args[0],
            this.plugin.Syslog.LOG_INFO);
        test.equals(this.plugin.Syslog.log.args[1], this.log.data);
        test.done();

        // local teardown
        this.plugin.Syslog.log = this.backup.plugin.Syslog.log;
    }
};
