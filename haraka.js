#!/usr/bin/env node

var logger = require('./logger');

var server = require('./server');

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

server.createServer();
