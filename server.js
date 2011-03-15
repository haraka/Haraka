// smtp network server

var util = require('util');
var net  = require('net');
var logger = require('./logger');
var config = require('./config');
var conn   = require('./connection');
var multi;
try { multi = require('./multi-node') }
catch (err) {
    logger.log("no multi-node available, running single-process");
}

var Server = exports;

var defaults = {
    port: 25,
    listen_host: '0.0.0.0',
    inactivity_timeout: 600
};

function apply_defaults(obj) {
    var key;
    for (key in defaults) {
        obj[key] = obj[key] || defaults[key];
    }
}

Server.createServer = function (params) {
    var config_data = config.get('smtp.ini', 'ini');
    var param_key;
    for (param_key in params) {
        if (typeof params[param_key] !== 'function') {
            config_data.main[param_key] = params[param_key];
        }
    }
    
    // config_data defaults
    apply_defaults(config_data.main);

    var server = net.createServer();
    server.on('connection', function(client) {
        client.setTimeout((config_data.main.inactivity_time || 300) * 1000);
        conn.createConnection(client);
    });
    if (multi && config_data.main.nodes) {
        Server.nodes = multi.listen({
            port: config_data.main.port,
            nodes: config_data.main.nodes,
            listen_address: config_data.main.listen_host
            }, server);
    }
    else {
        server.listen(config_data.main.port, config_data.main.listen_host,
            function () {
                logger.lognotice("Listening on port " + config_data.main.port);
            }
        );
    }
};
