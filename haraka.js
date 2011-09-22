#!/usr/bin/env node

var path   = require('path');

// this must be set before "server.js" is loaded
process.env.HARAKA = process.env.HARAKA || path.resolve('.');
try {
    require.paths.unshift(path.join(process.env.HARAKA, 'node_modules'));
}
catch(e) {
    process.env.NODE_PATH += ':' + path.join(process.env.HARAKA, 'node_modules');
}

var util   = require("util");
var fs     = require('fs');
var logger = require('./logger');
var server = require('./server');

exports.version = JSON.parse(
        fs.readFileSync(path.join(__dirname, './package.json'), 'utf8')
    ).version;

process.on('uncaughtException', function (err) {
    console.log("Uncaught exception, err="+util.inspect(err));
    if (err.stack) {
        err.stack.split("\n").forEach(logger.logcrit);
    }
    else {
        logger.logcrit('Caught exception: ' + err);
    }
    if (!server.ready) {
        logger.logcrit('Server not ready yet. Stopping.');
        logger.dump_logs();
        process.exit();
    }
});

logger.log("INFO", "Starting up Haraka version " + exports.version);


server.createServer();
