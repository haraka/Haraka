'use strict';
// nosql - a memory or Redis based key-value store
var path   = require('path');

var logger = require('./logger');
var config = require('./config');
var utils  = require('./utils');

var nosql  = exports;
nosql.cfg  = config.get('nosql.ini');
var default_callback = function (ignore) {};

nosql.get = function (key, done) {
    if (!done) done = default_callback;

    var caller = _get_caller_name();
    if (nosql.redis) {   // Redis selected, use it
        return nosql.redis.hget(caller, key, done);
    }

    if (nosql.isCluster) {
        nosql.get_ssc_collection(caller).get(key, function (err, res) {
            done(err, res.k);
        });
        return;
    }

    // else use volatile RAM storage
    if (!nosql.ramCache[caller]) {
        nosql.ramCache[caller] = {};
    }
    done(null, nosql.ramCache[caller][key]);
};

nosql.set = function (key, val, done) {
    if (!done) done = default_callback;

    var caller = _get_caller_name();
    if (nosql.redis) {
        nosql.redis.hset(caller, key, val, done);
        return;
    }

    if (nosql.isCluster) {
        // SSC saves JSON serialized, so put val into an object
        nosql.get_ssc_collection(caller).set(key, {k: val}, done);
        return;
    }

    // else use volatile RAM storage
    if (!nosql.ramCache[caller]) {
        nosql.ramCache[caller] = {};
    }
    var was_set = nosql.ramCache[caller][key] ? 0 : 1; // mimic redis result
    nosql.ramCache[caller][key] = val;
    done(null, was_set);
};

nosql.del = function (key, done) {
    if (!done) done = default_callback;

    var caller = _get_caller_name();
    if (nosql.redis) {
        return nosql.redis.hdel(caller, key, done);
    }

    if (nosql.isCluster) {
        nosql.get_ssc_collection(caller).del(key, done);
        return;
    }

    if (!nosql.ramCache[caller]) {
        nosql.ramCache[caller] = {};
    }
    delete nosql.ramCache[caller][key];
    done(null, 1);
};

nosql.incrby = function (key, incr, done) {
    if (!done) done = default_callback;

    var caller = _get_caller_name();
    if (nosql.redis) {
        return nosql.redis.hincrby(caller, key, incr, done);
    }

    if (isNaN(incr)) incr = 1;

    // cluster
    if (nosql.isCluster) {
        var sscCol = nosql.get_ssc_collection(caller);
        sscCol.get(key, function (err, val) {
            if (err) { logger.logerror(err); }
            if (isNaN(val)) val = 0;
            var newVal = parseFloat(val) + parseFloat(incr);
            sscCol.set(key, newVal, function (err, res) {
                // SSC does NOT return the value after set
                done(err, newVal);
            });
        });
        return;
    }

    // direct RAM
    if (!nosql.ramCache[caller]) {
        nosql.ramCache[caller] = {};
    }

    var val = parseFloat(nosql.ramCache[caller][key]) || 0;
    if (isNaN(val)) val = 0;

    nosql.ramCache[caller][key] = parseFloat(val) + parseFloat(incr);
    done(null, nosql.ramCache[caller][key]);
};

nosql.reset = function (done) {
    if (!done) done = default_callback;

    var caller = _get_caller_name();
    if (nosql.redis) {
        return nosql.redis.del(caller, done);
    }

    // cluster RAM
    if (nosql.isCluster) {
        // nosql.get_ssc_collection(caller).get(key, done);
        return;
    }

    // direct RAM
    if (!nosql.ramCache[caller]) {
        nosql.ramCache[caller] = {};
    }
    nosql.ramCache[caller] = {};
    done(null, 1);
};

// Strong-Store-Cluster functions
nosql.get_ssc_collection = function (plugin_name) {
    var c = nosql.ssc.collection(plugin_name);
        c.configure({
            expireKeys: parseFloat(nosql.cfg.cluster.expire) || 600,
        });
    return c;
};

// Redis DB functions
nosql.redis_connect = function (done) {
    var ranDone = 0;

    if (nosql.redis && nosql.redis_pings) {
        logger.logdebug('redis already connected');
        if (done) { ranDone++; done(null, true); }
        return;
    }

    var ip   = '127.0.0.1';
    var port = 6379;
    var dbid = 0;  // default is 0

    if (nosql.cfg.redis) {
        if (nosql.cfg.redis.host) ip   = nosql.cfg.redis.host;
        if (nosql.cfg.redis.port) port = nosql.cfg.redis.port;
        if (nosql.cfg.redis.db  ) dbid = nosql.cfg.redis.db;
    }

    var redis   = require('redis');   // npm module
    nosql.redis = redis.createClient(port, ip);  // client

    nosql.redis.on('error', function (error) {
        logger.logerror('nosql redis error: ' + error.message);
        if (done && !ranDone) { ranDone++; done(error); }
    });

    nosql.redis.on('connect', function () {
        logger.loginfo('redis connected');
        if (dbid) {
            logger.loginfo('redis db ' + dbid + ' selected');
            nosql.redis.select(dbid);
        }
        ranDone++;
        nosql.redis_ping(done);
    });
};

nosql.redis_ping = function(done) {

    var nope = function (err) {
        nosql.redis_pings=false;
        done(err, false);
    };

    if (!nosql.redis) { return nope('no redis!'); }

    nosql.redis.ping(function (err, res) {
        if (err           ) { return nope(err); }
        if (res !== 'PONG') { return nope('invalid redis response'); }
        nosql.redis_pings=true;
        done(null, true);
    });
};

function _get_caller_name () {

    var full_path = module.parent.filename;
    if (utils.node_min('0.12')) {
        return path.parse(full_path).name;
    }

    var file = full_path.split('/').pop();
    if (file.split('.').pop() === 'js') {
        return file.slice(0,-3);
    }
    return file;
}

nosql.init = function (done) {

    nosql.ramCache = {};

    if (nosql.cfg.store && nosql.cfg.store.backend === 'redis') {
        nosql.redis_connect(done);
        return;
    }

    nosql.isCluster = config.get('smtp.ini').main.nodes ? true : false;
    if (nosql.isCluster) {
        try {
            nosql.ssc = require('strong-store-cluster');
        }
        catch (e) {
            logger.logerror( 'cannot load strong-store-cluster' +
                    ' read "haraka -h nosql" to understand consequences');
            nosql.isCluster = false;
        }
    }

    if (done) done();
};

nosql.init();
