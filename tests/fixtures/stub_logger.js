'use strict';

var logger = exports;

function Logger() {
}

logger.createLogger = function() {
    var obj  = new Logger();
    return obj;
};
