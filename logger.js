"use strict";
// Log class

var config    = require('./config');
var plugins;
var connection;
var outbound;
var constants = require('./constants');
var util      = require('util');
var tty       = require('tty');

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

for (var level in logger.levels) {
    logger['LOG' + level] = logger.levels[level];
}

logger.loglevel     = logger.LOGWARN;
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

logger.colorize = function (color, str) {
    if (!util.inspect.colors) { return str; }  // node util before Nov 2013
    if (!util.inspect.colors[color]) { return str; }  // unknown color
    return '\u001b[' + util.inspect.colors[color][0] + 'm' + str +
           '\u001b[' + util.inspect.colors[color][1] + 'm';
};

var loglevel = logger.LOGWARN;

var deferred_logs = [];

logger.dump_logs = function (exit) {
    while (logger.deferred_logs.length > 0) {
        var log_item = logger.deferred_logs.shift();
        var color = logger.colors[log_item.level];
        if (color && stdout_is_tty) {
            console.log(logger.colorize(color,log_item.data));
        }
        else {
            console.log(log_item.data);
        }
    }
    if (exit) {
        process.exit(1);
    }
    return true;
};

logger.log = function (level, data) {
    if (level === 'PROTOCOL') {
        data = data.replace(/\n/g, '\\n\n');
    }
    data = data.replace(/\r/g, '\\r')
               .replace(/\n$/, '');

    var item = { 'level' : level, 'data'  : data };

    // buffer until plugins are loaded
    if (!plugins || !plugins.plugin_list) {
        logger.deferred_logs.push( item );
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

logger._init_loglevel = function () {
    var self = this;
    var _loglevel = config.get('loglevel', 'value', function () {
        self._init_loglevel();
    });
    if (_loglevel) {
        var loglevel_num = parseInt(_loglevel);
        if (!loglevel_num || isNaN(loglevel_num)) {
            this.log('INFO', 'loglevel: ' + _loglevel.toUpperCase());
            logger.loglevel = logger[_loglevel.toUpperCase()];
        }
        else {
            logger.loglevel = loglevel_num;
        }
        if (!logger.loglevel) {
            logger.loglevel = logger.LOGWARN;
        }
    }
};

logger.would_log = function (level) {
    if (logger.loglevel < level) { return false; }
    return true;
};

var original_console_log = console.log;

logger._init_timestamps = function () {
    var self = this;
    var _timestamps = config.get('log_timestamps', 'value', function () {
        self._init_timestamps();
    });
    if (_timestamps) {
        console.log = original_console_log.bind(console, new Date().toISOString());
    }
    else {
        console.log = original_console_log;
    }
};

logger._init_loglevel();
logger._init_timestamps();

logger.log_if_level = function (level, key, plugin) {
    return function() {
        if (logger.loglevel < logger[key]) { return; }
        var levelstr = '[' + level + ']';
        var str = '';
        var uuidstr = '[-]';
        var pluginstr = '[' + (plugin || 'core') + ']';
        for (var i=0; i < arguments.length; i++) {
            var data = arguments[i];
            if (typeof(data) !== 'object') {
                str += data;
                continue;
            }

            // if the object is a connection, add the connection id
            if (data instanceof connection.Connection) {
                uuidstr = '[' + data.uuid;
                if (data.tran_count > 0) {
                    uuidstr += "." + data.tran_count;
                }
                uuidstr += ']';
            }
            else if (data instanceof plugins.Plugin) {
                pluginstr = '[' + data.name + ']';
            }
            else if (data instanceof outbound.HMailItem) {
                pluginstr = '[outbound]';
                if (data.todo && data.todo.uuid) {
                    uuidstr = '[' + data.todo.uuid + ']';
                }
            }
            else {
                str += util.inspect(data);
            }
        }
        logger.log(level, [levelstr, uuidstr, pluginstr, str].join(' '));
        return true;
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
