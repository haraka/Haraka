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
var cluster     = require('cluster');

var daemon;
try { daemon = require('daemon'); } // npm install daemon
catch (err) {}

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
    inactivity_timeout: 600,
    daemonize: false,
    daemon_log_file: '/var/log/haraka.log',
    daemon_pid_file: '/var/run/haraka.pid'
};

function apply_defaults(obj) {
    var key;
    for (key in defaults) {
        obj[key] = obj[key] || defaults[key];
    }
}

Server.daemonize = function (config_data) {
    if (/^(?:1|true|yes|enabled|on)$/i.test(config_data.main.daemonize)) {
        if (!daemon) {
            logger.logdebug('unable to daemonize; daemon module not installed');
        }
        else {
            daemon.daemonize(config_data.main.daemon_log_file, 
                config_data.main.daemon_pid_file, 
                function (err, pid) {
                    if (err) {
                        throw err;
                    }
                    logger.lognotice('daemon started with pid: ' + pid);
                }
            );
        }
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

    var server = net.createServer(function (client) {
        client.setTimeout((config_data.main.inactivity_timeout || 300) * 1000);
        conn.createConnection(client, server);
    });
    server.notes = {};
    plugins.server = server;
    plugins.load_plugins();

    // Cluster
    if (cluster && config_data.main.nodes) {
        server.cluster = cluster;  // Allow plugins to access cluster!  
        if (cluster.isMaster) {
            this.daemonize(config_data);
            // Fork workers
            var workers = (config_data.main.nodes === 'cpus') ? 
                os.cpus().length : config_data.main.nodes;
            for (var i=0; i<workers; i++) {
                cluster.fork({ CLUSTER_MASTER_PID: process.pid });
            }
            cluster.on('online', function (worker) {
                logger.lognotice('worker ' + worker.id + ' started pid=' + worker.process.pid);
            });
            cluster.on('listening', function (worker, address) {
                logger.lognotice('worker ' + worker.id + ' listening on ' + address.address + ':' + address.port);
            });
            cluster.on('exit', function (worker, code, signal) {
                if (signal) {
                    logger.lognotice('worker ' + worker.id + ' killed by signal ' + signal);
                }
                else if (code !== 0) {
                    logger.lognotice('worker ' + worker.id + ' exited with error code: ' + code);
                }
                if (signal || code !== 0) {
                    // Restart worker
                    cluster.fork({ CLUSTER_MASTER_PID: process.pid });
                }
            });
            plugins.run_hooks('init_master', Server);
        }
        else {
            // Workers
            server.listen(config_data.main.port, config_data.main.listen_host, listening);
            plugins.run_hooks('init_child', Server);
        }
    }
    else {
        this.daemonize(config_data);
        server.listen(config_data.main.port, config_data.main.listen_host, listening);
        plugins.run_hooks('init_master', Server);
    }
};

Server.init_master_respond = function (retval, msg) {
    Server.ready = 1;
    switch(retval) {
        case constants.ok:
        case constants.cont:
                break;
        default:
                Server.logerror("init_master returned error" + ((msg) ? ': ' + msg : ''));
                process.exit(1);
    }
}

Server.init_child_respond = function (retval, msg) {
    switch(retval) {
        case constants.ok:
        case constants.cont:
                break;
        default:
                var pid = process.env.CLUSTER_MASTER_PID;
                Server.logerror("init_child returned error" + ((msg) ? ': ' + msg : ''));
                try {
                    if (pid) { 
                        process.kill(pid);
                        Server.logerror('Killing master (pid=' + pid + ')');
                    }
                }
                catch (err) {
                    Server.logerror('Terminating child');
                }
                process.exit(1);
    }
}

function listening () {
    var config_data = config.get('smtp.ini');
   
    // Drop privileges
    if (config_data.main.group) {
        Server.lognotice('Switching from current gid: ' + process.getgid());
        process.setgid(config_data.main.group);
        Server.lognotice('New gid: ' + process.getgid());
    }
    if (config_data.main.user) {
        Server.lognotice('Switching from current uid: ' + process.getuid());
        process.setuid(config_data.main.user);
        Server.lognotice('New uid: ' + process.getuid());
    }

    logger.lognotice("Listening on port " + config_data.main.port);
    Server.ready = 1;
   
    out.load_queue();
}
