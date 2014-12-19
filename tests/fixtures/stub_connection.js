'use strict';

var stub = require('./stub');
var logger = require('../../logger');
var ResultStore  = require('../../result_store');

var connection = exports;

function Connection(client, server) {
    this.client = client;
    this.server = server;
    this.relaying = false;
    this.notes  = {};
    this.results = new ResultStore(this);
    logger.add_log_methods(this, 'test');
}

connection.createConnection = function(client, server) {
    if (typeof(client) === 'undefined') {
        client = {};
    }

    if (typeof(server) === 'undefined') {
        server = {};
    }

    var obj  = new Connection(client, server);

    obj.respond = function(code, msg, func) { return func(); };
    obj.reset_transaction = function(cb) {
        if (this.transaction && this.transaction.resetting === false) {
            this.transaction.resetting = true;
        }
        else {
            this.transaction = null;
        }
        if (cb) cb();
    };

    obj.auth_results = function(message) {};

    return obj;
};
