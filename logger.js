"use strict";
// Log class

var config    = require('./config');
var plugins;
var connection;
var outbound;
var constants = require('./constants');
var util      = require('util');
var tty = require('tty')

var logger = exports;

logger.LOGDATA      = 9;
logger.LOGPROTOCOL  = 8;
logger.LOGDEBUG     = 7;
logger.LOGINFO      = 6;
logger.LOGNOTICE    = 5;
logger.LOGWARN      = 4;
logger.LOGERROR     = 3;
logger.LOGCRIT      = 2;
logger.LOGALERT     = 1;
logger.LOGEMERG     = 0;


logger.colors = { // Makes me cringe spelling it this way...
    "DATA" : "green",
    "PROTOCOL" : "green",
    "DEBUG" : "grey",
    "INFO" : "cyan",
    "info" : "cyan",
    "NOTICE" : "blue",
    "WARN" : "red",
    "ERROR" : "red",
    "CRIT" : "red",
    "ALERT" : "red",
    "EMERG" : "red"
};

var stdout_is_tty = tty.isatty(process.stdout.fd);

function colorize (color, str) {
    if (!util.inspect.colors[color]) return str;
    return '\u001b[' + util.inspect.colors[color][0] + 'm' + str +
              '\u001b[' + util.inspect.colors[color][1] + 'm';
}

var loglevel = logger.LOGWARN;

var deferred_logs = [];

logger.dump_logs = function (exit) {
    while (deferred_logs.length > 0) {
        var log_item = deferred_logs.shift();
        var color = logger.colors[log_item.level];
        if (color && stdout_is_tty) {
            console.log(colorize(color,log_item.data));
        }
        else {
            console.log(log_item.data);
        }
    }
    if (exit) {
        process.exit(1);
    }
}

logger.log = function (level, data) {
    if (level === 'PROTOCOL') {
        data = data.replace(/\n/g, '\\n\n');
    }
    data = data.replace(/\r/g, '\\r')
               .replace(/\n$/, '');
    // todo - just buffer these up (defer) until plugins are loaded
    if (plugins && plugins.plugin_list) {
        while (deferred_logs.length > 0) {
            var log_item = deferred_logs.shift();
            plugins.run_hooks('log', logger, log_item);
        }
        plugins.run_hooks('log', logger, {
            'level' : level,
            'data'  : data
        });
    }
    else {
        deferred_logs.push({
            'level' : level,
            'data'  : data
        });
    }
}

logger.log_respond = function (retval, msg, data) {
    // any other return code is irrelevant
    if (retval === constants.cont) {
        var color = logger.colors[data.level];
        if (color && stdout_is_tty) {
            return console.log(colorize(color,data.data));
        }
        else {
            return console.log(data.data);
        }
    }
};

logger._init_loglevel = function () {
    var self = this;
    var _loglevel = config.get('loglevel', 'value', function () {
        self._init_loglevel();
    });
    if (_loglevel) {
        var loglevel_num = parseInt(_loglevel);
        if (!loglevel_num || loglevel_num === NaN) {
            this.log('info', 'loglevel: ' + _loglevel.toUpperCase());
            loglevel = logger[_loglevel.toUpperCase()];
        }
        else {
            loglevel = loglevel_num;
        }
        if (!loglevel) {
            loglevel = logger.LOGWARN;
        }
    }
};

logger.would_log = function (level) {
    if (loglevel < level) return false;
    return true;
}

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
}

logger._init_loglevel();
logger._init_timestamps();

var level, key;
for (key in logger) {
    if(logger.hasOwnProperty(key)) {
        if (key.match(/^LOG\w/)) {
            level = key.slice(3);
            logger[key.toLowerCase()] = (function(level, key) {
                return function() {
                    if (loglevel < logger[key])
                        return;
                    var levelstr = "[" + level + "]";
                    var str = "";
                    var uuidstr = "[-]";
                    var pluginstr = "[core]";
                    for (var i = 0; i < arguments.length; i++) {
                        var data = arguments[i];
                        if (typeof(data) === 'object') {
                            // if the object is a connection, we wish to add
                            // the connection id
                            if (data instanceof connection.Connection) {
                                uuidstr = "[" + data.uuid;
                                if (data.tran_count > 0) {
                                  uuidstr += "." + data.tran_count;
                                }
                                uuidstr += "]";
                            }
                            else if (data instanceof plugins.Plugin) {
                                pluginstr = "[" + data.name + "]"; 
                            }
                            else if (data instanceof outbound.HMailItem) {
                                pluginstr = "[outbound]";
                                if (data.todo && data.todo.uuid) {
                                    uuidstr = "[" + data.todo.uuid + "]";
                                }
                            }
                            else {
                                str += util.inspect(data);
                            }
                        }
                        else {
                            str += data;
                        }
                    }
                    logger.log(level, [levelstr, uuidstr, pluginstr, str].join(" "));
                }
            })(level, key);
        }
    }
}

// load these down here so it sees all the logger methods compiled above
plugins = require('./plugins');
connection = require('./connection');
outbound = require('./outbound'); 
