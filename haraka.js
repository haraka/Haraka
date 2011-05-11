#!/usr/bin/env node

var logger = require('./logger');
var server = require('./server');

exports.version = '0.5';

process.on('uncaughtException', function (err) {
    if (err.stack) {
        err.stack.split("\n").forEach(logger.logcrit);
    }
    else {
        logger.logcrit('Caught exception: ' + err);
    }
    if (!server.ready) {
        logger.logcrit('Server not ready yet. Stopping.');
        process.exit();
    }
});

logger.log("Starting up Haraka version " + exports.version);


server.createServer();
