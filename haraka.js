#!/usr/bin/env node

'use strict';
const path = require('path');

if (!process.env.HARAKA) {
    console.warn("WARNING: Not running installed Haraka - command line arguments ignored")
}

// this must be set before "server.js" is loaded
process.env.HARAKA = process.env.HARAKA || path.resolve('.');
try {
    require.paths.push(path.join(process.env.HARAKA, 'node_modules'));
}
catch (e) {
    process.env.NODE_PATH = process.env.NODE_PATH ?
        (process.env.NODE_PATH + ':' +
             path.join(process.env.HARAKA, 'node_modules'))
        :
        (path.join(process.env.HARAKA, 'node_modules'));
    require('module')._initPaths(); // Horrible hack
}

const fs     = require('fs');
const logger = require('./logger');
const server = require('./server');

exports.version = JSON.parse(
    fs.readFileSync(path.join(__dirname, './package.json'), 'utf8')
).version;

process.on('uncaughtException', function (err) {
    if (err.stack) {
        err.stack.split("\n").forEach(function (line) {
            logger.logcrit(line);
        });
    }
    else {
        logger.logcrit('Caught exception: ' + JSON.stringify(err));
    }
    logger.dump_and_exit(1);
});

let shutting_down = false;
['SIGINT'].forEach(function (sig) {
    process.on(sig, function () {
        if (shutting_down) return process.exit(1);
        shutting_down = true;
        process.title = path.basename(process.argv[1], '.js');
        logger.lognotice(sig + ' received');
        logger.dump_and_exit(function () {
            if (server.cluster && server.cluster.isMaster) {
                server.performShutdown();
            }
            else if (!server.cluster) {
                server.performShutdown();
            }
        });
    });
});

process.on('SIGHUP', function () {
    logger.lognotice("Flushing the temp fail queue");
    server.flushQueue();
});

process.on('exit', function (code) {
    if (shutting_down) return;
    process.title = path.basename(process.argv[1], '.js');
    logger.lognotice('Shutting down');
    logger.dump_logs();
});

logger.log("NOTICE", "Starting up Haraka version " + exports.version);

server.createServer();
