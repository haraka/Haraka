"use strict";
// Log class

var config    = require('./config');
var plugins;
var connection;
var outbound;
var constants = require('./constants');
var util      = require('util');

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


var color_functions;
try {
    var colors = require('cli-color');
    color_functions = {
          "DATA" : colors.grey,
      "PROTOCOL" : colors.grey,
      "DEBUG" : colors.xterm(41),
      "INFO" : colors.xterm(13),
      "info" : colors.green,
      "NOTICE" : colors.xterm(250).bgXterm(17),
      "WARN" : colors.xterm(10).bgXterm(125),
      "ERROR" : colors.xterm(10).bgXterm(125),
      "CRIT" : colors.xterm(10).bgXterm(125),
      "ALERT" : colors.xterm(10).bgXterm(125),
      "EMERG" : colors.xterm(10).bgXterm(125)
    };
}
catch (err) {
    console.log(" Error while loading colors: "+err);
}

var loglevel = logger.LOGWARN;

var deferred_logs = [];

logger.dump_logs = function (exit) {
    while (deferred_logs.length > 0) {
        var log_item = deferred_logs.shift();
        var color;
        if (color_functions) {
            color = color_functions[log_item.level];
        }
        if (color) {
            console.log(color(log_item.data));
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
        var color;
        if (color_functions) {
            color = color_functions[data.level]
        }
        if (color) {
            return console.log(color(data.data));
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

logger._init_loglevel();

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
