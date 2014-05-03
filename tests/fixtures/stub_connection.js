"use strict";

var stub = require('./stub');

var connection = exports;

function Connection(client, server) {
    this.client = client;
    this.server = server;
    this.relaying = false;
    this.notes  = {};

    var levels = [ 'data', 'protocol', 'debug', 'info', 'notice', 'warn', 'error', 'crit', 'alert', 'emerg' ];
    for (var i=0; i < levels.length; i++) {
        this['log' + levels[i]] = stub();
    }
}

connection.createConnection = function(client, server) {
    if (typeof(client) === 'undefined') {
        client = {};
    }

    if (typeof(server) === 'undefined') {
        server = {};
    }

    var obj  = new Connection(client, server);
    return obj;
};
