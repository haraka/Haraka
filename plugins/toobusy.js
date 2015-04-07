// Stop accepting new connections when we are too busy

var toobusy = require('toobusy-js');
var was_busy = false;

exports.register = function () {
    var plugin = this;

    plugin.loadConfig();
};

exports.loadConfig = function () {
    var plugin = this;
    var maxLag = plugin.config.get('toobusy.maxlag','value', function() {
        plugin.loadConfig();
    });

    maxLag = parseInt(maxLag);
    if (maxLag) {
        // This will throw an exception on error
        toobusy.maxLag(maxLag);
    }
};

exports.hook_lookup_rdns = function (next, connection) {
    if (!toobusy()) {
        was_busy = false;
        return next();
    }

    if (was_busy) {
        was_busy = true;
        return next(DENYSOFTDISCONNECT, 'Too busy; try again later');
    }

    // Log a CRIT error at the first occurrence
    var currentLag = toobusy.lag();
    var maxLag = toobusy.maxLag();
    this.logcrit('deferring connections: lag=' + currentLag + ' max=' + maxLag);
};
