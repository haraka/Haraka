var prof = require('v8-profiler');

exports.hook_connect = function (next, conn) {
    prof.startProfiling("Connection from: " + conn.remote_ip);
    next();
}

exports.hook_disconnect = function (next, conn) {
    prof.stopProfiling("Connection from: " + conn.remote_ip);
    next();
}