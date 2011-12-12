"use strict";
// smtp network server

var net         = require('./tls_socket');
var logger      = require('./logger');
var config      = require('./config');
var conn        = require('./connection');
var out         = require('./outbound');
var plugins     = require('./plugins');
var constants   = require('./constants');
var os          = require('os');

var cluster;
try { cluster = require('cluster') } // cluster can be installed with npm
catch (err) {
    logger.logdebug("no cluster available, running single-process");
}

// Need these here so we can run hooks
for (var key in logger) {
    if (key.match(/^log\w/)) {
        exports[key] = (function (key) {
            return function () {
                var args = ["[server] "];
                for (var i=0, l=arguments.length; i<l; i++) {
                    args.push(arguments[i]);
                }
                logger[key].apply(logger, args);
            }
        })(key);
    }
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
    var config_data = config.get('smtp.ini');
    var param_key;
    for (param_key in params) {
        if (typeof params[param_key] !== 'function') {
            config_data.main[param_key] = params[param_key];
        }
    }
    
    // config_data defaults
    apply_defaults(config_data.main);
    
    plugins.load_plugins();
    
    var server = net.createServer(function (client) {
        client.setTimeout((config_data.main.inactivity_timeout || 300) * 1000);
        conn.createConnection(client, server);
    });
    server.notes = {};
    if (cluster && config_data.main.nodes) {
         
        var c = cluster(server);
        var cluster_modules = config.get('cluster_modules', 'list');
        
        if (config_data.main.nodes !== 'cpus') {
            c.set('workers', config_data.main.nodes);
        }
        if (config_data.main.user) {
            c.set('user', config_data.main.user);
        }
        
        for (var i=0,l=cluster_modules.length; i < l; i++) {
            var matches = /^(\w+)\s*(?::\s*(.*))?$/.exec(cluster_modules[i]);
            if (!matches) {
                Server.logerror("cluster_modules in invalid format: " + cluster_modules[i]);
                continue;
            }
            var module = matches[1];
            var params = matches[2];
            if (params) {
                c.use(cluster[module](JSON.parse(params)));
            }
            else {
                c.use(cluster[module]());
            }
        }
        
        c.set('host', config_data.main.listen_host);
        c.listen(parseInt(config_data.main.port));
        c.on('listening', listening);
        Server.cluster = c;
        c.on('start', function () {
            plugins.run_hooks('init_master', Server);
        });
        if (c.isWorker) {
            plugins.run_hooks('init_child', Server);
        }
    }
    else {
        server.listen(config_data.main.port, config_data.main.listen_host, listening);
        
        plugins.run_hooks('init_master', Server);

        if (config_data.main.user) {
            // drop privileges
            Server.lognotice('Switching from current uid: ' + process.getuid());
            process.setuid(config_data.main.user);
            Server.lognotice('New uid: ' + process.getuid());
        }
    }
};

Server.init_master_respond = function (retval, msg) {
    Server.ready = 1;
    switch(retval) {
        case constants.ok:
        case constants.cont:
                break;
        default:
                Server.logerror("init_master stopped startup: " + msg);
                process.exit();
    }
}

Server.init_child_respond = function (retval, msg) {
    switch(retval) {
        case constants.ok:
        case constants.cont:
                break;
        default:
                Server.logerror("init_child returned with error. Killing Haraka. " + msg);
                process.kill(process.env.CLUSTER_MASTER_PID);
    }
}

function listening () {
    var config_data = config.get('smtp.ini');
    logger.lognotice("Listening on port " + config_data.main.port);
    out.load_queue();
    Server.ready = 1;
}
