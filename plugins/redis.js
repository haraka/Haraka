'use strict';

var redis  = require('redis');

exports.register = function () {
    var plugin = this;

    plugin.load_redis_ini();

    plugin.register_hook('init_master',  'init_redis_connection');
    plugin.register_hook('init_child',   'init_redis_connection');
};

exports.load_redis_ini = function () {
    var plugin = this;

    plugin.cfg = plugin.config.get('redis.ini', function () {
        plugin.load_redis_ini();
    });

    if (!plugin.cfg.server) plugin.cfg.server = {};
    if (plugin.cfg.server.ip && !plugin.cfg.server.host) {
        plugin.cfg.server.host = plugin.cfg.server.ip;
    }
    if (!plugin.cfg.server.host) plugin.cfg.server.host = '127.0.0.1';
    if (!plugin.cfg.server.port) plugin.cfg.server.port = '6379';

    if (!plugin.cfg.redisOpts) plugin.cfg.redisOpts = {};
};

exports.init_redis_connection = function (next, server) {
    var plugin = this;

    if (server.notes.redis && server.notes.redis.ping()) {
        plugin.loginfo('already connected');
        return next(); // connection is good
    }

    var calledNext = false;
    function callNext () {
        if (calledNext) return;
        calledNext = true;
        next();
    }

    var cfg = plugin.cfg.server;
    var client = redis
        .createClient(cfg.port, cfg.host, plugin.cfg.redisOpts)
        .on('error', function (error) {
            plugin.logerror('Redis error: ' + error.message);
            callNext();
        })
        .on('ready', function () {
            plugin.loginfo(plugin, 'connected to ' + client.host +
                    (client.port ? ':' + client.port : '') +
                    (cfg.db ? '/' + cfg.db : '') +
                    ' v' + client.server_info.redis_version
                    );
            server.notes.redis = client;
            if (cfg.db) {
                server.notes.redis.select(cfg.db);
                plugin.loginfo('dbid ' + cfg.db + ' selected');
            }
            callNext();
        });
};
