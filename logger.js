// Log class

var config = require('./config');

var logger = exports;

logger.LOGDEBUG     = 7;
logger.LOGINFO      = 6;
logger.LOGNOTICE    = 5;
logger.LOGWARN      = 4;
logger.LOGERROR     = 3;
logger.LOGCRIT      = 2;
logger.LOGALERT     = 1;
logger.LOGEMERG     = 0;

var loglevel = logger.LOGWARN;

logger.log = function (data) {
    data = data.replace(/\n?$/, "");
    console.log(data);
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

for (var key in logger) {
    if (key.match(/^LOG\w/)) {
        var level = key.slice(3);
        var key_copy = key.slice(0); // copy
        // For some reason I have to use eval here or this doesn't work...
        eval("logger." + key.toLowerCase() + 
             " = function (data) { if (loglevel >= " + logger[key_copy] + 
             ") { logger.log(\"" + level + ": \" + data); } }");
    }
}

