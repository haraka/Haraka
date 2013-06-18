// Stop accepting new connections when we are too busy

var toobusy = require('toobusy');
var was_busy = false;

exports.register = function () {
    var self = this;

    function loadConfig () {
        var maxLag = self.config.get('toobusy.maxlag','value', function() {
            loadConfig();
        });
        maxLag = parseInt(maxLag);
        if (maxLag) {
            // This will throw an exception on error
            toobusy.maxLag(maxLag);
        }
    }

    loadConfig();
}

exports.hook_lookup_rdns = function (next, connection) {
    if (toobusy()) {
        // Log a CRIT error at the first occurrence
        if (!was_busy) {
            var currentLag = toobusy.lag();
            var maxLag = toobusy.maxLag();
            this.logcrit('deferring connections: lag=' + currentLag + ' max=' + maxLag);
        }
        was_busy = true;
        return next(DENYSOFTDISCONNECT, 'Too much load; please try again later');
    }
    was_busy = false;
    return next();
}
