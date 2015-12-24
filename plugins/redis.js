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

    plugin.redisCfg = plugin.config.get('redis.ini', function () {
        plugin.load_redis_ini();
    });

    if (!plugin.redisCfg.server) plugin.redisCfg.server = {};
    var s = plugin.redisCfg.server;
    if (s.ip && !s.host) s.host = s.ip;
    if (!s.host) s.host = '127.0.0.1';
    if (!s.port) s.port = '6379';

    if (!plugin.redisCfg.pubsub) {
        plugin.redisCfg.pubsub = JSON.parse(JSON.stringify(s));
    }
    var ps = plugin.redisCfg.pubsub;
    if (!ps.host) ps.host = s.host;
    if (!ps.port) ps.port = s.port;

    if (!plugin.redisCfg.opts) plugin.redisCfg.opts = {};
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

    var opts = plugin.redisCfg.opts;
    opts.host = plugin.redisCfg.server.host;
    opts.port = plugin.redisCfg.server.port;
    server.notes.redis = plugin.get_redis_client(opts, callNext);
};

exports.get_redis_client = function (opts, next) {
    var plugin = this;
    var db = 0;
    if (opts.db !== undefined) {
        db = opts.db;
        delete opts.db;
    }

    var client = redis.createClient(opts)
        .on('error', function (error) {
            plugin.logerror('Redis error: ' + error.message);
            next();
        })
        .on('ready', function () {
            if (db) client.select(db);

            var msg = 'connected to redis://' + opts.host + ':' + opts.port;
            if (db) msg += '/' + db;
            if (client.server_info && client.server_info.redis_version) {
                msg += ' v' + client.server_info.redis_version;
            }
            plugin.loginfo(plugin, msg);
            next();
        });

    return client;
};

exports.get_redis_pub_channel = function (conn) {
    return 'result-' + conn.transaction ? conn.transaction.uuid : conn.uuid;
};

exports.get_redis_sub_channel = function (conn) {
    return 'result-' + conn.uuid + '*';
};

exports.redis_subscribe = function (connection, next) {
    var plugin = this;

    if (connection.notes.redis) {
        // another plugin has already called this. Do nothing
        return next();
    }

    connection.notes.redis = require('redis').createClient({
        host: plugin.redisCfg.pubsub.host,
        port: plugin.redisCfg.pubsub.port,
    })
    .on('psubscribe', function (pattern, count) {
        connection.logdebug(plugin, 'psubscribed to ' + pattern);
        next();
    })
    .on('punsubscribe', function (pattern, count) {
        connection.logdebug(plugin, 'unsubsubscribed from ' + pattern);
    });
    connection.notes.redis.psubscribe(plugin.get_redis_sub_channel(connection));
};

exports.redis_unsubscribe = function (connection) {
    if (!connection.notes.redis) return;
    connection.notes.redis.punsubscribe(this.get_redis_sub_channel(connection));
};
