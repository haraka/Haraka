#!/usr/bin/env node

var logger = require('./logger');
var server = require('./server');

exports.version = '0.2';

process.on('uncaughtException', function (err) {
    if (err.stack) {
        err.stack.split("\n").forEach(logger.logcrit);
    }
    else {
        logger.logcrit('Caught exception: ' + err);
    }
    if (!server.ready) {
        process.exit();
    }
});

logger.log("Starting up Haraka version " + exports.version);


server.createServer();
