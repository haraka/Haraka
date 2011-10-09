// smtp network server

var net         = require('./tls_socket');
var logger      = require('./logger');
var config      = require('./config');
var conn        = require('./connection');
var out         = require('./outbound');
var plugins     = require('./plugins');
var constants   = require('./constants');
var os          = require('os');

// Load cluster.js if available. 
// Please node that 'cluster' must also be enabled via smtp.ini nodes=xxx. The value equates to cluster's 'workers' setting
var cluster;
try { cluster = require('cluster') } // cluster can be installed with npm
catch (err) {
    logger.logdebug("no cluster available, running single-process");
}

// Need these here so we can run hooks
// @TODO I can read the comment above, but I don't understand why. Why essentially re-export what logger already provides? Is this because of these weird cyclic module dependencies?
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

// @TODO config, logger etc. names start with lowercase. Why 'Server'? What are the code conventions?
var Server = exports;

// System wide defaults
var defaults = {
    port: 25,
    listen_host: '0.0.0.0',
    inactivity_timeout: 600
};

/**
 * Apply defaults to 'obj' if not already otherwise preset
 * 
 * @param obj
 */
function apply_defaults(obj) {
    var key;
    for (key in defaults) {
        obj[key] = obj[key] || defaults[key];
    }
}

/**
 * Create Haraka server object
 * 
 * @param params Provide specific config value, superseding system and config file default values.
 */
Server.createServer = function (params) {
	// @TODO see my comment in configfile.js. The 'type' parameter seems superfluous
	// Load default config from file
    var config_data = config.get('smtp.ini', 'nolog', 'ini');
    
    // Replace defaults with data from 'params' where available
    var param_key;
    for (param_key in params) {
        if (typeof params[param_key] !== 'function') {
            config_data.main[param_key] = params[param_key];
        }
    }
    
    // Add crucial config data which might still be missing
    apply_defaults(config_data.main);
    
    plugins.load_plugins();
    
    var server = net.createServer(function (client) {
    	// @TODO may the 300 should go into defaults as well
    	// @TODO Like discussed in configfile, I personally think "main" is superfluous and shall be removed for consistency reasons.
        client.setTimeout((config_data.main.inactivity_time || 300) * 1000);
        conn.createConnection(client, server);
    });

    server.notes = {};

	// cluster.js must be available AND cluster must be enabled via smtp.ini nodes=xxx. The value equates to cluster's 'workers' setting
    if (cluster && config_data.main.nodes) {

        var c = cluster(server);
        var cluster_modules = config.get('cluster_modules', 'nolog', 'list');

		// @TODO Am I right to assume that cpus is the default? Any reason for the if() statement?        
        if (config_data.main.nodes !== 'cpus') {
            c.set('workers', config_data.main.nodes);
        }
        if (config_data.main.user) {
            c.set('user', config_data.main.user);
        }

        for (var i=0,l=cluster_modules.length; i < l; i++) {
            var parts = cluster_modules[i].split(':');
            var module = parts.shift();
            c.use(cluster[module].apply(cluster, parts));
        }
        
        c.set('host', config_data.main.listen_host);
        c.listen(parseInt(config_data.main.port));
        c.on('listening', listening);
        Server.cluster = c;
        c.on('start', function () {
            plugins.run_hooks('init_master', Server);
        });
        c.on('worker', function () {
            plugins.run_hooks('init_child', Server);
        });
    }
    else {
        server.listen(config_data.main.port, config_data.main.listen_host, listening);
        
        plugins.run_hooks('init_master', Server);

		// @TODO this is not possible or feasible for cluster setups?
        if (config_data.main.user) {
            // drop privileges
            Server.lognotice('Switching from current uid: ' + process.getuid());
            process.setuid(config_data.main.user);
            Server.lognotice('New uid: ' + process.getuid());
        }
    }
};

/**
 * Function responding to 'init_master' events emitted via plugins.run_hooks(..).
 * 
 * @param retval ??
 * @param msg ??
 */
Server.init_master_respond = function (retval, msg) {
    Server.ready = 1;
    switch(retval) {
        case constants.ok:
        case constants.cont:
                break;
        default:
        		// @TODO What is wrong with logger.logerror() ??
                Server.logerror("init_master stopped startup: " + msg);
                process.exit();
    }
}

/**
 * Function responding to 'init_child' events emitted via plugins.run_hooks(..).
 * 
 * @param retval ??
 * @param msg ??
 */
Server.init_child_respond = function (retval, msg) {
    switch(retval) {
        case constants.ok:
        case constants.cont:
                break;
        default:
        		// @TODO What is wrong with logger.logerror() ??
                Server.logerror("init_child returned with error. Killing Haraka. " + msg);
                process.kill(process.env.CLUSTER_MASTER_PID);
    }
}

/**
 * (Not sure how this works. It seems related to cluster.js and a callback when a child process starts listening)
 */
function listening () {
	// @TODO may be the following line should go into a very simple local function, since I've seen it several times in this module already
    var config_data = config.get('smtp.ini', 'nolog', 'ini');
    // @TODO Why does logger.logxxx work here but not above? Why is Server.logxxx() used above??
    logger.lognotice("Listening on port " + config_data.main.port);
    out.load_queue();
    Server.ready = 1;
}