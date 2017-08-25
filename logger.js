'use strict';
// Log class

var util      = require('util');
var tty       = require('tty');

var constants = require('haraka-constants');
var logfmt    = require('logfmt');

var config    = require('./config');
var plugins;
var connection;
var outbound;

var logger = exports;

logger.levels = {
    DATA:     9,
    PROTOCOL: 8,
    DEBUG:    7,
    INFO:     6,
    NOTICE:   5,
    WARN:     4,
    ERROR:    3,
    CRIT:     2,
    ALERT:    1,
    EMERG:    0,
};

for (var le in logger.levels) {
    logger['LOG' + le] = logger.levels[le];
}

logger.formats = {
    DEFAULT: "DEFAULT",
    LOGFMT: "LOGFMT",
};

logger.loglevel = logger.LOGWARN;
logger.format = logger.formats.DEFAULT;
logger.deferred_logs = [];

logger.colors = {
    "DATA" : "green",
    "PROTOCOL" : "green",
    "DEBUG" : "grey",
    "INFO" : "cyan",
    "NOTICE" : "blue",
    "WARN" : "red",
    "ERROR" : "red",
    "CRIT" : "red",
    "ALERT" : "red",
    "EMERG" : "red",
};

var stdout_is_tty = tty.isatty(process.stdout.fd);

logger._init = function () {
    this.load_log_ini();
    this._init_loglevel();
    this._init_timestamps();
}

logger.load_log_ini = function () {
    let self = this;
    self.cfg = config.get('log.ini', {
        booleans: [
            '+main.timestamps',
        ]
    },
    function () {
        self.load_log_ini();
    });

    this.set_loglevel(this.cfg.main.level);
    this.set_timestamps(this.cfg.main.timestamps);
    this._init_format(this.cfg.main.format);
}

logger.colorize = function (color, str) {
    if (!util.inspect.colors[color]) { return str; }  // unknown color
    return '\u001b[' + util.inspect.colors[color][0] + 'm' + str +
           '\u001b[' + util.inspect.colors[color][1] + 'm';
};

logger.dump_logs = function (cb) {
    while (logger.deferred_logs.length > 0) {
        var log_item = logger.deferred_logs.shift();
        plugins.run_hooks('log', logger, log_item);
    }
    // Run callback after flush
    if (cb) process.stdout.write('', cb);
    return true;
};

if (!util.isFunction) {
    util.isFunction = function (functionToCheck) {
        var getType = {};
        return functionToCheck && getType.toString.call(functionToCheck) === '[object Function]';
    };
}

logger.dump_and_exit = function (code) {
    this.dump_logs(function () {
        if (util.isFunction(code)) return code();
        process.exit(code);
    });
}

logger.log = function (level, data) {
    if (level === 'PROTOCOL') {
        data = data.replace(/\n/g, '\\n');
    }
    data = data.replace(/\r/g, '\\r')
        .replace(/\n$/, '');

    var item = { 'level' : level, 'data'  : data };

    // buffer until plugins are loaded
    if (!plugins || (Array.isArray(plugins.plugin_list) &&
                     !plugins.plugin_list.length))
    {
        logger.deferred_logs.push(item);
        return true;
    }

    // process buffered logs
    while (logger.deferred_logs.length > 0) {
        var log_item = logger.deferred_logs.shift();
        plugins.run_hooks('log', logger, log_item);
    }

    plugins.run_hooks('log', logger, item );
    return true;
};

logger.log_respond = function (retval, msg, data) {
    // any other return code is irrelevant
    if (retval !== constants.cont) { return false; }

    var color = logger.colors[data.level];
    if (color && stdout_is_tty) {
        console.log(logger.colorize(color,data.data));
        return true;
    }

    console.log(data.data);
    return true;
};

logger.set_loglevel = function (level) {

    if (!level) return;

    let loglevel_num = parseInt(level);
    if (!loglevel_num || isNaN(loglevel_num)) {
        this.log('INFO', 'loglevel: ' + level.toUpperCase());
        logger.loglevel = logger[level.toUpperCase()];
    }
    else {
        logger.loglevel = loglevel_num;
    }

    if (!logger.loglevel) {
        this.log('WARN', 'invalid loglevel: ' + level + ' defaulting to LOGWARN');
        logger.loglevel = logger.LOGWARN;
    }
}

logger._init_loglevel = function () {
    let self = this;

    let _loglevel = config.get('loglevel', 'value', function () {
        self._init_loglevel();
    });

    self.set_loglevel(_loglevel);
}

logger._init_format = function (_format) {

    if (_format) {
        logger.format = logger.formats[_format.toUpperCase()];
        this.log('INFO', 'log format: ' + _format.toUpperCase());
    }
    else {
        logger.format = null;
    }
    if (!logger.format) {
        this.log('WARN', 'invalid log format: ' + _format + ' defaulting to DEFAULT');
        logger.format = logger.formats.DEFAULT;
    }
};

logger.would_log = function (level) {
    if (logger.loglevel < level) { return false; }
    return true;
};

var original_console_log = console.log;

logger.set_timestamps = function (value) {

    if (!value) {
        console.log = original_console_log;
        return;
    }

    console.log = function () {
        let new_arguments = [new Date().toISOString()];
        for (let key in arguments) {
            new_arguments.push(arguments[key]);
        }
        original_console_log.apply(console, new_arguments);
    };
}

logger._init_timestamps = function () {
    let self = this;

    let _timestamps = config.get('log_timestamps', 'value', function () {
        self._init_timestamps();
    });

    this.set_timestamps(_timestamps);
};

logger._init();

logger.log_if_level = function (level, key, plugin) {
    return function () {
        if (logger.loglevel < logger[key]) { return; }
        var logobj = {
            level,
            uuid: '-',
            origin: (plugin || 'core'),
            message: ''
        };
        for (var i=0; i < arguments.length; i++) {
            var data = arguments[i];
            if (typeof data !== 'object') {
                logobj.message += (data);
                continue;
            }
            if (!data) continue;

            // if the object is a connection, add the connection id
            if (data instanceof connection.Connection) {
                logobj.connection_uuid = data.uuid;
                if (data.tran_count > 0) {
                    logobj.connection_uuid += "." + data.tran_count;
                }
            }
            else if (data instanceof plugins.Plugin) {
                logobj.origin = data.name;
            }
            else if (data.name) {
                logobj.origin = data.name;
            }
            else if (data instanceof outbound.HMailItem) {
                logobj.origin = 'outbound';
                if (data.todo && data.todo.uuid) {
                    logobj.connection_uuid = data.todo.uuid;
                }
            }
            else if (
                logger.format === logger.formats.LOGFMT &&
                data.constructor === Object
            ) {
                logobj = Object.assign(logobj, data);
            }
            else if (data.constructor === Object) {
                if (!logobj.message.endsWith(' ')) {
                    logobj.message += ' ';
                }
                logobj.message += (logfmt.stringify(data));
            }
            else {
                logobj.message += (util.inspect(data));
            }
        }
        switch (logger.format) {
            case logger.formats.LOGFMT:
                logger.log(
                    level,
                    logfmt.stringify(logobj)
                );
                return true;
            case logger.formats.DEFAULT:
            default:
                logger.log(
                    level,
                    [
                        '[' + logobj.level + ']',
                        '[' + logobj.connection_uuid + ']',
                        '[' + logobj.origin + ']',
                        logobj.message
                    ].join(' ')
                );
                return true;
        }
    };
};

logger.add_log_methods = function (object, plugin) {
    if (!object) return;
    if (typeof(object) !== 'object') return;
    for (var level in logger.levels) {
        var fname = 'log' + level.toLowerCase();
        if (object[fname]) continue;  // already added
        object[fname] = logger.log_if_level(level, 'LOG'+level, plugin);
    }
};

logger.add_log_methods(logger);

// load these down here so it sees all the logger methods compiled above
plugins = require('./plugins');
connection = require('./connection');
outbound = require('./outbound');
