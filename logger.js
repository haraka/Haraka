// Log class

var config    = require('./config');
var plugins;
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

var loglevel = logger.LOGWARN;

var deferred_logs = [];

logger.log = function (data) {
    data = data.replace(/\n?$/, "");
    // todo - just buffer these up (defer) until plugins are loaded
    if (plugins.plugin_list) {
        while (deferred_logs.length > 0) {
            var log_item = deferred_logs.shift();
            plugins.run_hooks('log', logger, log_item);
        }
        plugins.run_hooks('log', logger, data);
    }
    else {
        deferred_logs.push(data);
    }
}

logger.log_respond = function (retval, msg, data) {
    // any other return code is irrelevant
    if (retval === constants.cont) {
        return console.log(data);
    }
};

logger._init_loglevel = function () {
    var _loglevel = config.get('loglevel', 'nolog', 'value');
    if (_loglevel) {
        var loglevel_num = parseInt(_loglevel);
        if (!loglevel_num || loglevel_num === NaN) {
            loglevel = logger[_loglevel.toUpperCase()];
        }
        else {
            loglevel = loglevel_num;
        }
        if (!loglevel) {
            loglevel = logger.LOGWARN;
        }
    }
    // logger.log("Set log level to: " + loglevel);
};

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
                    var str = "[" + level + "] ";
                    for (var i = 0; i < arguments.length; i++) {
                        var data = arguments[i];
                        if (typeof(data) === 'object') {
                            str += util.inspect(data);
                        }
                        else {
                            str += data;
                        }
                    }
                    logger.log(str);
                }
            })(level, key);
        }
    }
}

// load this down here so it sees all the logger methods compiled above
plugins = require('./plugins');
