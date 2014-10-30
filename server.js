"use strict";
// smtp network server
/* jshint node: true */

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
logger.add_log_methods(exports, 'server');

var Server = exports;

var defaults = {
    inactivity_timeout: 600,
    daemonize: false,
    daemon_log_file: '/var/log/haraka.log',
    daemon_pid_file: '/var/run/haraka.pid'
};

function apply_defaults(obj) {
    for (var key in defaults) {
        obj[key] = obj[key] || defaults[key];
    }
}

Server.daemonize = function (config_data) {
    if (!/^(?:1|true|yes|enabled|on)$/i.test(config_data.main.daemonize)) {
        return;
    }

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
};

Server.flushQueue = function () {
    if (!Server.cluster) {
        out.flush_queue();
        return;
    }

    for (var id in cluster.workers) {
        cluster.workers[id].send({event: 'outbound.flush_queue'});
    }
};

Server.get_listen_addrs = function (cfg, port) {
    if (!port) port = 25;
    var listeners = [];
    if (cfg && cfg.listen) {
        listeners = cfg.listen.split(/\s*,\s*/);
        if (listeners[0] === '') listeners = [];
        for (var i=0; i < listeners.length; i++) {
            if (/:[0-9]{1,5}$/.test(listeners[i])) continue;
            listeners[i] = listeners[i] + ':' + port;
        }
    }
    if (cfg.port) {
        var host = cfg.listen_host;
        if (!host) {
            host = '[::0]';
            Server.default_host = true;
        }
        listeners.unshift(host + ':' + cfg.port);
    }
    if (listeners.length) return listeners;

    Server.default_host = true;
    listeners.push('[::0]:' + port);

    return listeners;
};

Server.createServer = function (params) {
    var cfg = config.get('smtp.ini');
    for (var key in params) {
        if (typeof params[key] === 'function') continue;
        cfg.main[key] = params[key];
    }

    // cfg defaults
    apply_defaults(cfg.main);

    Server.notes = {};
    plugins.server = Server;
    plugins.load_plugins();

    var inactivity_timeout = (cfg.main.inactivity_timeout || 300) * 1000;

    if (!cluster || !cfg.main.nodes) {
        this.daemonize(cfg);
        setup_smtp_listeners(cfg, plugins, "master", inactivity_timeout);
        return;
    }

    // Cluster
    Server.cluster = cluster;
    if (!cluster.isMaster) {      // Workers
        setup_smtp_listeners(cfg, plugins, "child", inactivity_timeout);
        return;
    }

    // Master
    out.scan_queue_pids(function (err, pids) {
        if (err) {
            Server.logcrit("Scanning queue failed. Shutting down.");
            process.exit(1);
        }
        Server.daemonize(cfg);
        // Fork workers
        var workers = (cfg.main.nodes === 'cpus') ?
            os.cpus().length : cfg.main.nodes;
        var new_workers = [];
        for (var i=0; i<workers; i++) {
            new_workers.push(cluster.fork({ CLUSTER_MASTER_PID: process.pid }));
        }
        for (var j=0; j<pids.length; j++) {
            new_workers[j % new_workers.length].send({event: 'outbound.load_pid_queue', data: pids[j]});
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
};

Server.get_smtp_server = function (host, port, inactivity_timeout) {

    var server;
    var conn_cb = function (client) {
        client.setTimeout(inactivity_timeout);
        conn.createConnection(client, server);
    };

    if (port != 465) {
        server = net.createServer(conn_cb);
        return server;
    }

    var options = {
        key: config.get('tls_key.pem', 'binary'),
        cert: config.get('tls_cert.pem', 'binary'),
    };
    if (!options.key) {
        logger.logerror("Missing tls_key.pem for port 465");
        return;
    }
    if (!options.cert) {
        logger.logerror("Missing tls_cert.pem for port 465");
        return;
    }

    logger.logdebug("Creating TLS server on " + host + ':' + port);
    server = require('tls').createServer(options, conn_cb);
    server.has_tls=true;
    return server;
};

function setup_smtp_listeners (cfg, plugins, type, inactivity_timeout) {

    var listeners = Server.get_listen_addrs(cfg.main);

    var runInitHooks = function (err) {
        if (err) {
            logger.logerror("Failed to setup listeners: " + err.message);
            return process.exit(-1);
        }
        Server.listening();
        plugins.run_hooks('init_' + type, Server);
    };

    var setupListener = function (host_port, cb) {

        var hp = /^\[?([^\]]+)\]?:(\d+)$/.exec(host_port);
        if (!hp) {
            return cb(new Error("Invalid format for listen parameter in smtp.ini"));
        }
        var host = hp[1];
        var port = hp[2];

        var server = Server.get_smtp_server(host, port, inactivity_timeout);
        if (!server) return cb();

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
            if (e.code === 'EAFNOSUPPORT' && /^::0/.test(host) && Server.default_host) {
                server.listen(port, '0.0.0.0');
            }
            else {
                // Pass error to callback
                cb(e);
            }
        });

        server.listen(port, host);
    };

    async.each(listeners, setupListener, runInitHooks);
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
};

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
};

Server.listening = function () {
    var cfg = config.get('smtp.ini');

    // Drop privileges
    if (cfg.main.group) {
        Server.lognotice('Switching from current gid: ' + process.getgid());
        process.setgid(cfg.main.group);
        Server.lognotice('New gid: ' + process.getgid());
    }
    if (cfg.main.user) {
        Server.lognotice('Switching from current uid: ' + process.getuid());
        process.setuid(cfg.main.user);
        Server.lognotice('New uid: ' + process.getuid());
    }

    Server.ready = 1;
};
