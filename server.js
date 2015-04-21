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
var path        = require('path');

// Need these here so we can run hooks
logger.add_log_methods(exports, 'server');

var Server = exports;

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
        daemon_pid_file: '/var/run/haraka.pid'
    };

    for (var key in defaults) {
        if (Server.cfg.main[key] !== undefined) continue;
        Server.cfg.main[key] = defaults[key];
    }
};

Server.load_http_ini = function () {
    Server.http_cfg = config.get('http.ini', function () {
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
        Server.setup_http_listeners(plugins, 'master');
        return;
    }

    // Cluster
    Server.cluster = cluster;

    // Workers
    if (!cluster.isMaster) {
        Server.setup_smtp_listeners(plugins, 'child', inactivity_timeout);
        Server.setup_http_listeners(plugins, 'child');
        return;
    }

    // Master
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

Server.setup_http_listeners = function (plugins, type) {
    if (!Server.http_cfg) return;
    if (!Server.http_cfg.listen) return;

    var listeners = Server.get_listen_addrs(Server.http_cfg, 80);
    if (!listeners.length) return;

    var express;
    try {
        express = require('express');
    }
    catch (err) {
        logger.logerror('express failed to load. No http server. ' +
                ' Try installing express with: npm install -g express');
        return;
    }
    var app = express();
    var server, wss;

    Server.init_http_respond = function () {
        // logger.loginfo(arguments);
    };
    Server.init_wss_respond = function () {
        // logger.loginfo(arguments);
    };

    var setupListener = function (host_port, cb) {
        var hp = /^\[?([^\]]+)\]?:(\d+)$/.exec(host_port);
        if (!hp) {
            return cb(new Error('Invalid format for listen in http.ini'));
        }

        server = require('http').createServer(app);

        server.on('listening', function () {
            var addr = this.address();
            logger.lognotice('Listening on ' + addr.address + ':' + addr.port);
            cb();
        });

        server.on('error', function (e) { cb(e); });

        server.listen(hp[2], hp[1]);
    };

    var registerRoutes = function (err) {
        if (err) {
            logger.logerror('Failed to setup http routes: ' + err.message);
        }

        plugins.run_hooks('init_http', Server, app);

        var WebSocketServer;
        try { WebSocketServer = require('ws').Server; }
        catch (e) {
            logger.logerror('unable to load ws.\ndid you: npm install -g ws?');
        }

        if (WebSocketServer) {
            wss = new WebSocketServer({ server: server });
            plugins.run_hooks('init_wss', Server, wss);
        }

        app.get('/plugins', Server.http_plugins);
        app.use(express.static(Server.get_http_docroot()));
        app.use(Server.handle404);
    };

    async.each(listeners, setupListener, registerRoutes);
};

Server.init_master_respond = function (retval, msg) {
    if (!(retval === constants.ok || retval === constants.cont)) {
        Server.logerror("init_master returned error" + ((msg) ? ': ' + msg : ''));
        process.exit(1);
    }

    var c = Server.cfg.main;
    Server.ready = 1;

    // Load the queue if we're just one process
    if (!(cluster && c.nodes)) {
        out.load_queue();
    }
    else {
        // Running under cluster, fork children here, so that
        // cluster events can be registered in init_master hooks.
        out.scan_queue_pids(function (err, pids) {
            if (err) {
                Server.logcrit("Scanning queue failed. Shutting down.");
                process.exit(1);
            }
            Server.daemonize();
            // Fork workers
            var workers = (c.nodes === 'cpus') ?
                os.cpus().length : c.nodes;
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
        });
    }
};

Server.init_child_respond = function (retval, msg) {
    if (!(retval === constants.ok || retval === constants.cont)) {
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

Server.get_http_docroot = function () {
    if (Server.http_cfg.docroot) return Server.http_cfg.docroot;

    Server.http_cfg.docroot = path.join(
        (process.env.HARAKA || __dirname),
        '/html'
    );
    logger.loginfo('using html docroot: ' + Server.http_cfg.docroot);
    return Server.http_cfg.docroot;
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

Server.http_plugins = function(req, res) {
    return res.json({ plugins: Server.hooks_to_run });
};
