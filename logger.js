/**
 * @@ Standard Header @@
 */

// Log class

// Please see the node.js documentation on cyclic dependencies. config requires logger and logger requires config. Same seems true for plugins, though why is require(plugins) required at all???
var config    = require('./config');
var plugins;
var constants = require('./constants');
var util      = require('util');

var logger = exports;

// Constants
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

// System default log level. Might be replaced with config from config/loglevel.ini|json
var loglevel = logger.LOGWARN;

// Since logging in Haraka works via a plugin provide hook, all logs prio to the plugins being loaded must be deferred.
// They'll be printed after all plugins are initialized.
var deferred_logs = [];

/**
 * Print all deferred log entries to console.log(). The list of deferred logs will be empty afterwards. This method is useful
 * if Haraka catches an unrecoverable exception before the plugins are loaded. 
 */
logger.dump_logs = function () {
    while (deferred_logs.length > 0) {
        var log_item = deferred_logs.shift();
        console.log(log_item.data);
    }
}

/**
 * Log 'data' if 'level' is equal or higer than current log level
 * 
 * @param level Log level of the data provided
 * @param data Data to be logged
 */
logger.log = function (level, data) {
	// @TODO I typically use /(\r|\n)+/g, though empty lines are removed this way as well
    data = data.replace(/\r?\n/g, "\\n");
    // todo - just buffer these up (defer) until plugins are loaded
    if (plugins.plugin_list) {
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

/**
 * This function gets called upon plugins.run_hooks('log', ...). Hence the function name must be 'log' + '_respond'
 * 
 * @param retval ??
 * @param msg ??
 * @param data ??
 */
logger.log_respond = function (retval, msg, data) {
    // any other return code is irrelevant
    if (retval === constants.cont) {
        return console.log(data.data);
    }
};

/**
 * Constructor: replace system default with value from 'loglevel' config file
 */
logger._init_loglevel = function () {
    var _loglevel = config.get('loglevel', 'nolog', 'value');
    if (_loglevel) {
        var loglevel_num = parseInt(_loglevel);
        if (!loglevel_num || loglevel_num === NaN) {
        	// Assume _loglevel is a text like logwarn, logerror etc. (simply warn or error doesn't work) than get the respective loglevel number
        	// @FIXME logger[] is not yet initialized and thus returns null. How is this perceived to work? How is it meant to provide a default loglevel??
            loglevel = logger[_loglevel.toUpperCase()];
        }
        else {
            loglevel = loglevel_num;
        }
        // @TODO is this necessary? System default is already set
        if (!loglevel) {
            loglevel = logger.LOGWARN;
        }
    }
    // logger.log("Set log level to: " + loglevel);
};

logger._init_loglevel();

// @FIXME _init_loglevel() depends on the list generated below and yet _init_loglevel() gets called before ????? 
var level, key;
for (key in logger) {
    if(logger.hasOwnProperty(key)) {
        if (key.match(/^LOG\w/)) {
            level = key.slice(3);
            // allow e.g. logger.logcrit("my message") in addition to logger.log("CRIT", "my message")
            logger[key.toLowerCase()] = (function(level, key) {
                return function() {
                	// Priority below current log level, than ignore it.
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
                    // E.g. WARN, "[WARN] My Message"
                    logger.log(level, str);
                }
            })(level, key);
        }
    }
}

// load this down here so it sees all the logger methods compiled above
// @TODO I'm really confused with these cyclic dependencies. Is there any means to tell the javascript compiler/interpreter to tell me "entered xx", "finished xx", "continue xx" ???
plugins = require('./plugins');
