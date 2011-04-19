// smtp network server

var net  = require('net');
var logger = require('./logger');
var config = require('./config');
var conn   = require('./connection');
var os     = require('os');
var cluster;
try { cluster = require('cluster') } // cluster can be installed with npm
catch (err) {
    logger.logdebug("no cluster available, running single-process");
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
            var parts = cluster_modules[i].split(':');
            var module = parts.shift();
            c.use(cluster[module].apply(cluster, parts));
        }
        
        c.set('host', config_data.main.listen_host);
        c.listen(parseInt(config_data.main.port));

    }
    else {
        server.listen(config_data.main.port, config_data.main.listen_host,
            function () {
                logger.lognotice("Listening on port " + config_data.main.port);
            }
        );
    }

    if (config_data.main.user) {
        // drop privileges
        logger.lognotice('Switching from current uid: ' + process.getuid());
        process.setuid(config_data.main.user);
        logger.lognotice('New uid: ' + process.getuid());
    }

    server.on('connection', function(client) {
        client.setTimeout((config_data.main.inactivity_time || 300) * 1000);
        conn.createConnection(client);
    });

};
