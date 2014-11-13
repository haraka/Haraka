'use strict';
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
logger.add_log_methods(exports, 'server');

var Server = exports;

Server.load_smtp_ini = function () {
    Server.cfg = config.get('smtp.ini', {
        booleans: [
            '-main.daemonize',
            ],
    },
    Server.load_smtp_ini);

    var defaults = {
        inactivity_timeout: 600,
        daemon_log_file: '/var/log/haraka.log',
        daemon_pid_file: '/var/run/haraka.pid'
    };

    for (var key in defaults) {
        if (Server.cfg[key] !== undefined) continue;
        Server.cfg[key] = defaults[key];
    }
};
Server.load_smtp_ini();

Server.daemonize = function (config_data) {
    var c = this.cfg.main;
    if (!c.daemonize) return;

    if (!process.env.__daemon) {
        // Remove process.on('exit') listeners otherwise
        // we get a spurious 'Exiting' log entry.
        process.removeAllListeners('exit');
        logger.lognotice('Daemonizing...');
    }

    var log_fd = require('fs').openSync(c.daemon_log_file, 'a');
    daemon({stdout: log_fd});

    // We are the daemon from here on...
    var npid = require('npid');
    try {
        npid.create(c.daemon_pid_file).removeOnExit();
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
    var c = Server.cfg.main;
    for (var key in params) {
        if (typeof params[key] === 'function') continue;
        c[key] = params[key];
    }

    Server.notes = {};
    plugins.server = Server;
    plugins.load_plugins();

    var inactivity_timeout = (c.inactivity_timeout || 300) * 1000;

    if (!cluster || !c.nodes) {
        Server.daemonize(c);
        Server.setup_smtp_listeners(plugins, 'master', inactivity_timeout);
        return;
    }

    // Cluster
    Server.cluster = cluster;
    if (!cluster.isMaster) {      // Workers
        Server.setup_smtp_listeners(plugins, "child", inactivity_timeout);
        return;
    }

    // Master
    out.scan_queue_pids(function (err, pids) {
        if (err) {
            Server.logcrit("Scanning queue failed. Shutting down.");
            process.exit(1);
        }
        Server.daemonize();
        // Fork workers
        var workers = (c.nodes === 'cpus') ? os.cpus().length : c.nodes;
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

Server.setup_smtp_listeners = function (plugins, type, inactivity_timeout) {

    var listeners = Server.get_listen_addrs(Server.cfg.main);

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
};

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
    var c = Server.cfg.main;

    // Drop privileges
    if (c.group) {
        Server.lognotice('Switching from current gid: ' + process.getgid());
        process.setgid(c.group);
        Server.lognotice('New gid: ' + process.getgid());
    }
    if (c.user) {
        Server.lognotice('Switching from current uid: ' + process.getuid());
        process.setuid(c.user);
        Server.lognotice('New uid: ' + process.getuid());
    }

    Server.ready = 1;
};
