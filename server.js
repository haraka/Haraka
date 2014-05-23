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
var async       = require('async');
var daemon      = require('daemon');

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
        if (!process.env.__daemon) {
            // Remove process.on('exit') listeners otherwise
            // we get a spurious 'Exiting' log entry.
            process.removeAllListeners('exit');
            logger.lognotice('Daemonizing...');
        }
        var log_fd = require('fs').openSync(config_data.main.daemon_log_file, 'a');
        daemon({stdout: log_fd});
        // We are the daemon from here on...
        var npid = require('npid');
        try {
            npid.create(config_data.main.daemon_pid_file).removeOnExit();
        }
        catch (err) {
            logger.logerror(err.message);
            process.exit(1);
        }
    }
}

Server.flushQueue = function () {
    if (Server.cluster) {
        for (var id in cluster.workers) {
            cluster.workers[id].send({event: 'outbound.flush_queue'});
        }
    }
    else {
        out.flush_queue();
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

    var listeners = (config_data.main.listen || '').split(/\s*,\s*/);
    if (listeners[0] === '') listeners = [];
    if (config_data.main.port) {
        var host = config_data.main.listen_host;
        if (!host) { 
            host = '[::0]';
            Server.default_host = true;
        }
        listeners.unshift(host + ':' + config_data.main.port);
    }
    if (!listeners.length) {
        Server.default_host = true;
        listeners.push('[::0]:25');
    }

    Server.notes = {};
    plugins.server = Server;
    plugins.load_plugins();

    var inactivity_timeout = (config_data.main.inactivity_timeout || 300) * 1000;

    // Cluster
    if (cluster && config_data.main.nodes) {
        Server.cluster = cluster; 
        if (cluster.isMaster) {
            out.scan_queue_pids(function (err, pids) {
                if (err) {
                    Server.logcrit("Scanning queue failed. Shutting down.");
                    process.exit(1);
                }
                Server.daemonize(config_data);
                // Fork workers
                var workers = (config_data.main.nodes === 'cpus') ? 
                    os.cpus().length : config_data.main.nodes;
                var new_workers = [];
                for (var i=0; i<workers; i++) {
                    new_workers.push(cluster.fork({ CLUSTER_MASTER_PID: process.pid }));
                }
                for (var i=0; i<pids.length; i++) {
                    new_workers[i % new_workers.length].send({event: 'outbound.load_pid_queue', data: pids[i]});
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
                        var new_worker = cluster.fork({ CLUSTER_MASTER_PID: process.pid });
                        new_worker.send({event: 'outbound.load_pid_queue', data: worker.process.pid});
                    }
                });
                plugins.run_hooks('init_master', Server);
            });
        }
        else {
            // Workers
            setup_listeners(listeners, plugins, "child", inactivity_timeout);
        }
    }
    else {
        this.daemonize(config_data);
        setup_listeners(listeners, plugins, "master", inactivity_timeout);
    }
};

function setup_listeners (listeners, plugins, type, inactivity_timeout) {
    async.each(listeners, function (host_port, cb) {
        var hp = /^\[?([^\]]+)\]?:(\d+)$/.exec(host_port);
        if (!hp) {
            return cb(new Error("Invalid format for listen parameter in smtp.ini"));
        }
        
        var conn_cb = function (client) {
            client.setTimeout(inactivity_timeout);
            conn.createConnection(client, server);
        };

        var server;
        if (hp[2] == 465) {
            var options = {
                key: config.get('tls_key.pem', 'binary'),
                cert: config.get('tls_cert.pem', 'binary'),
            };
            if (!options.key) {
                return cb(new Error("Missing tls_key.pem for port 465"));
            }
            if (!options.cert) {
                return cb(new Error("Missing tls_cert.pem for port 465"));
            }
            logger.lognotice("Creating TLS server on " + host_port);
            server = require('tls').createServer(options, conn_cb);
            server.has_tls=true;
        }
        else {
            server = net.createServer(conn_cb);
        }

        server.notes = Server.notes;
        if (Server.cluster) server.cluster = Server.cluster;

        server.on('listening', function () {
            var addr = this.address();
            logger.lognotice("Listening on " + addr.address + ':' + addr.port);
            cb();
        });

        // Fallback from IPv6 to IPv4 if not supported
        // But only if we supplied the default of [::0]:25
        server.on('error', function (e) {
            if (e.code === 'EAFNOSUPPORT' && /^::0/.test(hp[1]) && Server.default_host) {
                server.listen(hp[2], '0.0.0.0');
            }
            else {
                // Pass error to callback
                cb(e);
            }
        });

        server.listen(hp[2], hp[1]);
    }, function (err) {
        if (err) {
            logger.logerror("Failed to setup listeners: " + err.message);
            return process.exit(-1);
        }
        listening();
        plugins.run_hooks('init_' + type, Server);
    });
}

Server.init_master_respond = function (retval, msg) {
    Server.ready = 1;
    switch(retval) {
        case constants.ok:
        case constants.cont:
                // Load the queue if we're just one process
                if (!(cluster && config.get('smtp.ini').main.nodes)) {
                    out.load_queue();
                }
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

    Server.ready = 1;
}
