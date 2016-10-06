'use strict';
// smtp network server

var net         = require('./tls_socket');
var logger      = require('./logger');
var config      = require('./config');
var conn        = require('./connection');
var out         = require('./outbound');
var plugins     = require('./plugins');
var constants   = require('haraka-constants');
var os          = require('os');
var cluster     = require('cluster');
var async       = require('async');
var daemon      = require('daemon');
var path        = require('path');

// Need these here so we can run hooks
logger.add_log_methods(exports, 'server');

var Server = exports;
Server.listeners = [];

Server.load_smtp_ini = function () {
    Server.cfg = config.get('smtp.ini', {
        booleans: [
            '-main.daemonize',
        ],
    }, function () {
        Server.load_smtp_ini();
    });

    var defaults = {
        inactivity_timeout: 600,
        daemon_log_file: '/var/log/haraka.log',
        daemon_pid_file: '/var/run/haraka.pid',
        force_shutdown_timeout: 30,
    };

    for (var key in defaults) {
        if (Server.cfg.main[key] !== undefined) continue;
        Server.cfg.main[key] = defaults[key];
    }
};

Server.load_http_ini = function () {
    Server.http = {};
    Server.http.cfg = config.get('http.ini', function () {
        Server.load_http_ini();
    }).main;
};

Server.load_smtp_ini();
Server.load_http_ini();

Server.daemonize = function () {
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
        logger.dump_and_exit(1);
    }
};

Server.flushQueue = function (domain) {
    if (!Server.cluster) {
        out.flush_queue(domain);
        return;
    }

    for (var id in cluster.workers) {
        cluster.workers[id].send({event: 'outbound.flush_queue', domain: domain});
    }
};

var gracefull_in_progress = false;

Server.gracefulRestart = function () {
    Server._graceful();
}

Server.gracefulShutdown = function () {
    logger.loginfo('Shutting down listeners');
    Server.listeners.forEach(function (server) {
        server.close();
    });
    Server._graceful(function () {
        logger.loginfo("Failed to shutdown naturally. Exiting.");
        process.exit(0);
    });
}

Server._graceful = function (shutdown) {
    if (!Server.cluster) {
        if (shutdown) {
            ['outbound', 'cfreader', 'plugins'].forEach(function (module) {
                process.emit('message', {event: module + '.shutdown'});
            });
            var t = setTimeout(shutdown, Server.cfg.main.force_shutdown_timeout * 1000);
            return t.unref();
        }
    }

    if (gracefull_in_progress) {
        logger.lognotice("Restart currently in progress - ignoring request");
        return;
    }

    gracefull_in_progress = true;
    // TODO: Make these configurable
    var disconnect_timeout = 30;
    var exit_timeout = 30;
    cluster.removeAllListeners('exit');
    // only reload one worker at a time
    // otherwise, we'll have a time when no connection handlers are running
    var worker_ids = Object.keys(cluster.workers);
    async.eachSeries(worker_ids, function (id, cb) {
        logger.lognotice("Killing node: " + id);
        var worker = cluster.workers[id];
        ['outbound', 'cfreader', 'plugins'].forEach(function (module) {
            worker.send({event: module + '.shutdown'});
        })
        worker.disconnect();
        var disconnect_received = false;
        var disconnect_timer = setTimeout(function () {
            if (!disconnect_received) {
                logger.logcrit("Disconnect never received by worker. Killing.");
                worker.kill();
            }
        }, disconnect_timeout * 1000);
        worker.once("disconnect", function() {
            clearTimeout(disconnect_timer);
            disconnect_received = true;
            logger.lognotice("Disconnect complete");
            var dead = false;
            var timer = setTimeout(function () {
                if (!dead) {
                    logger.logcrit("Worker " + id + " failed to shutdown. Killing.");
                    worker.kill();
                }
            }, exit_timeout * 1000);
            worker.once("exit", function () {
                dead = true;
                clearTimeout(timer);
                if (shutdown) cb();
            });
        });
        if (shutdown) return;
        var newWorker = cluster.fork();
        newWorker.once("listening", function() {
            logger.lognotice("Replacement worker online.");
            newWorker.on('exit', function (code, signal) {
                cluster_exit_listener(newWorker, code, signal);
            });
            cb();
        });
    }, function (err) {
        // err can basically never happen, but fuckit...
        if (err) logger.logerror(err);
        if (shutdown) {
            logger.loginfo("Workers closed. Shutting down master process subsystems");
            ['outbound', 'cfreader', 'plugins'].forEach(function (module) {
                process.emit('message', {event: module + '.shutdown'});
            })
            var t2 = setTimeout(shutdown, Server.cfg.main.force_shutdown_timeout * 1000);
            return t2.unref();
        }
        gracefull_in_progress = false;
        logger.lognotice("Reload complete, workers: " + JSON.stringify(Object.keys(cluster.workers)));
    });
}

Server.drainPools = function () {
    if (!Server.cluster) {
        return out.drain_pools();
    }

    for (var id in cluster.workers) {
        cluster.workers[id].send({event: 'outbound.drain_pools'});
    }
};

Server.sendToMaster = function (command, params) {
    // console.log("Send to master: ", command);
    if (Server.cluster) {
        if (Server.cluster.isMaster) {
            Server.receiveAsMaster(command, params);
        }
        else {
            process.send({cmd: command, params: params});
        }
    }
    else {
        Server.receiveAsMaster(command, params);
    }
}

Server.receiveAsMaster = function (command, params) {
    if (!Server[command]) {
        logger.logerror("Invalid command: " + command);
    }
    Server[command].apply(Server, params);
}

function messageHandler (worker, msg) {
    // console.log("received cmd: ", msg);
    if (msg && msg.cmd) {
        Server.receiveAsMaster(msg.cmd, msg.params);
    }
}

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

    // Cluster Workers
    if (!cluster.isMaster) {
        Server.setup_smtp_listeners(plugins, 'child', inactivity_timeout);
        return;
    }
    else {
        // console.log("Setting up message handler");
        cluster.on('message', messageHandler);
    }

    // Cluster Master
    // We fork workers in init_master_respond so that plugins
    // can put handlers on cluster events before they are emitted.
    plugins.run_hooks('init_master', Server);
};

Server.get_smtp_server = function (host, port, inactivity_timeout) {
    var server;
    var conn_cb = function (client) {
        client.setTimeout(inactivity_timeout);
        conn.createConnection(client, server);
    };

    if (port !== '465') {
        server = net.createServer(conn_cb);
        Server.listeners.push(server);
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
    Server.listeners.push(server);
    return server;
};

Server.setup_smtp_listeners = function (plugins2, type, inactivity_timeout) {
    var listeners = Server.get_listen_addrs(Server.cfg.main);

    var runInitHooks = function (err) {
        if (err) {
            logger.logerror("Failed to setup listeners: " + err.message);
            return logger.dump_and_exit(-1);
        }
        Server.listening();
        plugins2.run_hooks('init_' + type, Server);
    };

    var setupListener = function (host_port, cb) {

        var hp = /^\[?([^\]]+)\]?:(\d+)$/.exec(host_port);
        if (!hp) {
            return cb(new Error(
                        'Invalid format for listen parameter in smtp.ini'));
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

        server.on('close', function () {
            logger.loginfo('Listener shutdown');
        });

        // Fallback from IPv6 to IPv4 if not supported
        // But only if we supplied the default of [::0]:25
        server.on('error', function (e) {
            if (e.code === 'EAFNOSUPPORT' &&
                    /^::0/.test(host) &&
                    Server.default_host) {
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

Server.setup_http_listeners = function () {
    if (!Server.http.cfg) return;
    if (!Server.http.cfg.listen) return;

    var listeners = Server.get_listen_addrs(Server.http.cfg, 80);
    if (!listeners.length) return;

    try {
        Server.http.express = require('express');
        logger.loginfo('express loaded at Server.http.express');
    }
    catch (err) {
        logger.logerror('express failed to load. No http server. ' +
                ' Try installing express with: npm install -g express');
        return;
    }

    var app = Server.http.express();
    Server.http.app = app;
    logger.loginfo('express app is at Server.http.app');

    var setupListener = function (host_port, cb) {
        var hp = /^\[?([^\]]+)\]?:(\d+)$/.exec(host_port);
        if (!hp) {
            return cb(new Error('Invalid format for listen in http.ini'));
        }

        Server.http.server = require('http').createServer(app);
        Server.listeners.push(Server.http.server);

        Server.http.server.on('listening', function () {
            var addr = this.address();
            logger.lognotice('Listening on ' + addr.address + ':' + addr.port);
            cb();
        });

        Server.http.server.on('error', function (e) {
            logger.logerror(e);
            cb(e);
        });

        Server.http.server.listen(hp[2], hp[1]);
    };

    var registerRoutes = function (err) {
        if (err) {
            logger.logerror('Failed to setup http routes: ' + err.message);
        }

        plugins.run_hooks('init_http', Server);
        app.use(Server.http.express.static(Server.get_http_docroot()));
        app.use(Server.handle404);
    };

    async.each(listeners, setupListener, registerRoutes);
};

Server.init_master_respond = function (retval, msg) {
    if (!(retval === constants.ok || retval === constants.cont)) {
        Server.logerror("init_master returned error" +
                ((msg) ? ': ' + msg : ''));
        return logger.dump_and_exit(1);
    }

    var c = Server.cfg.main;
    Server.ready = 1;

    // Load the queue if we're just one process
    if (!(cluster && c.nodes)) {
        out.load_queue();
        Server.setup_http_listeners();
        return;
    }

    // Running under cluster, fork children here, so that
    // cluster events can be registered in init_master hooks.
    out.scan_queue_pids(function (err, pids) {
        if (err) {
            Server.logcrit("Scanning queue failed. Shutting down.");
            return logger.dump_and_exit(1);
        }
        Server.daemonize();
        // Fork workers
        var workers = (c.nodes === 'cpus') ? os.cpus().length : c.nodes;
        var new_workers = [];
        for (var i=0; i<workers; i++) {
            new_workers.push(cluster.fork({ CLUSTER_MASTER_PID: process.pid }));
        }
        for (var j=0; j<pids.length; j++) {
            new_workers[j % new_workers.length]
                .send({event: 'outbound.load_pid_queue', data: pids[j]});
        }
        cluster.on('online', function (worker) {
            logger.lognotice('worker ' + worker.id + ' started pid=' +
                    worker.process.pid);
        });
        cluster.on('listening', function (worker, address) {
            logger.lognotice('worker ' + worker.id + ' listening on ' +
                    address.address + ':' + address.port);
        });
        cluster.on('exit', cluster_exit_listener);
    });
};

function cluster_exit_listener (worker, code, signal) {
    if (signal) {
        logger.lognotice('worker ' + worker.id +
                ' killed by signal ' + signal);
    }
    else if (code !== 0) {
        logger.lognotice('worker ' + worker.id +
                ' exited with error code: ' + code);
    }
    if (signal || code !== 0) {
        // Restart worker
        var new_worker = cluster.fork({
            CLUSTER_MASTER_PID: process.pid
        });
        new_worker.send({
            event: 'outbound.load_pid_queue', data: worker.process.pid,
        });
    }
}

Server.init_child_respond = function (retval, msg) {
    switch (retval) {
        case constants.ok:
        case constants.cont:
            Server.setup_http_listeners();
            return;
    }

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
    logger.dump_and_exit(1);
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

Server.init_http_respond = function () {
    logger.loginfo('init_http_respond');

    var WebSocketServer;
    try { WebSocketServer = require('ws').Server; }
    catch (e) {
        logger.logerror('unable to load ws.\ndid you: npm install -g ws?');
        return;
    }

    if (!WebSocketServer) {
        logger.logerror('ws failed to load');
        return;
    }

    Server.http.wss = new WebSocketServer({ server: Server.http.server });
    logger.loginfo('Server.http.wss loaded');

    plugins.run_hooks('init_wss', Server);
};

Server.init_wss_respond = function () {
    logger.loginfo('init_wss_respond');
    // logger.logdebug(arguments);
};

Server.get_http_docroot = function () {
    if (Server.http.cfg.docroot) return Server.http.cfg.docroot;

    Server.http.cfg.docroot = path.join(
        (process.env.HARAKA || __dirname),
        '/html'
    );
    logger.loginfo('using html docroot: ' + Server.http.cfg.docroot);
    return Server.http.cfg.docroot;
};

Server.handle404 = function(req, res){
    // abandon all hope, serve up a 404
    var docroot = Server.get_http_docroot();

    // respond with html page
    if (req.accepts('html')) {
        res.status(404).sendFile('404.html', { root: docroot });
        return;
    }

    // respond with json
    if (req.accepts('json')) {
        res.status(404).send({ err: 'Not found' });
        return;
    }

    res.status(404).send('Not found!');
};
