"use strict";

var stub = require('tests/fixtures/stub');

var connection = exports;

function Connection(client, server) {
    this.client = client;
    this.server = server;
    this.relaying = false;
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
