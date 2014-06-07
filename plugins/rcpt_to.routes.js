// rcpt_to.routes - per email/domain mail routes
//
// validates incoming recipients against flat file & Redis
// routes mail based on per-email or per-domain specified routes

var redis;

exports.register = function() {
    var plugin = this;
    plugin.cfg = {};
    plugin.route_list={};

    var load_config = function () {
        plugin.loginfo(plugin, "loading rcpt_to.routes.ini");
        plugin.cfg = plugin.config.get('rcpt_to.routes.ini', load_config);

        var lowered = {};
        if (plugin.cfg.routes) {
            var keys = Object.keys(plugin.cfg.routes);
            for (var i=0; i < keys.length; i++) {
                lowered[keys[i].toLowerCase()] = plugin.cfg.routes[keys[i]];
            }
            plugin.route_list = lowered;
        }
    };
    load_config();

    try { redis = require('redis'); }
    catch (e) {
        plugin.logerror("unable to load redis.\ndid you: npm install -g redis?");
    }

    if (redis) {
        plugin.init_redis_connection();
        if (!plugin.db) {
            plugin.logerror("Failed to connect, Redis lookup support disabled.");
        }
    }

    plugin.register_hook('rcpt',   'rcpt');
    plugin.register_hook('get_mx', 'get_mx');
};

exports.rcpt = function(next, connection, params) {
    var plugin = this;
    var txn = connection.transaction;
    if (!txn) { return next(); }

    var rcpt = params[0];

    // ignore RCPT TO without an @ first
    if (!rcpt.host) {
        txn.results.add(plugin, {fail: 'rcpt!domain'});
        return next();
    }

    var address = rcpt.address().toLowerCase();
    var domain = rcpt.host.toLowerCase();

    connection.loginfo(plugin, "Checking for " + address);

    var file_search = function () {
        if (plugin.route_list[address]) { return next(OK); }
        if (plugin.route_list[domain])  { return next(OK); }

        // not permitted (by this rcpt_to plugin)
        return next();
    };

    // if we can't use redis, try files and return
    if (!redis || !plugin.init_redis_connection) { return file_search(); }

    // redis connection open, try it
    plugin.db.multi()
        .get(address)
        .get(domain)
        .exec(function (err, replies) {
            if (err) {
                connection.results.add(plugin, {err: err});
                return next();
            }

            // got replies from Redis, any with an MX?
            if (replies[0]) { return next(OK); }
            if (replies[1]) { return next(OK); }

            return file_search(); // no redis record, try files
        });
};

exports.get_mx = function(next, hmail, domain) {
    var plugin = this;

    // get email address
    var address = hmail.rcpt_to[0].original.toLowerCase();

    var file_search = function () {
        // check email adress for route
        if (plugin.route_list[address]) {
            return next(OK, plugin.route_list[address]);
        }

        // check email domain for route
        if (plugin.route_list[domain]) {
            return next(OK, plugin.route_list[domain]);
        }

        plugin.loginfo('using normal MX lookup for: ' + address);
        return next();
    };

    // if we can't use redis, try files and return
    if (!redis || !plugin.db) { return file_search(); }

    // redis connection open, try it
    plugin.db.multi()
        .get(address)
        .get(domain)
        .exec(function (err, replies) {
            if (err) {
                connection.results.add(plugin, {err: err});
                return next();
            }

            // got replies from Redis, any with an MX?
            if (replies[0]) { return next(OK, replies[0]); }
            if (replies[1]) { return next(OK, replies[1]); }

            return file_search(); // no redis record, try files
        });
};

// Redis DB functions
exports.init_redis_connection = function () {
    var plugin = this;
    if (plugin.db && plugin.db.ping()) return true;  // connection is good

    var redis_ip  = '127.0.0.1';
    var redis_port = 6379;
    var redis_db  = 0;  // default

    if (plugin.cfg.redis) {
        redis_ip = plugin.cfg.redis.server_ip || '127.0.0.1';
        redis_port = plugin.cfg.redis.server_port || 6379;
        redis_db  = plugin.cfg.redis.db || 0;
    }

    plugin.db = redis.createClient(redis_port, redis_ip);
    plugin.db.on('error', function (error) {
        plugin.logerror(plugin, 'Redis error: ' + error.message);
        plugin.db = null;
        return false;
    });

    if (plugin.db) {
        if (redis_db) { plugin.db.select(redis_db); }
        return true;
    }
    return false;
};

exports.insert_route = function (email, route, cb) {
    // for importing, see http://redis.io/topics/mass-insert
    this.db.set(email, route, cb);
};

exports.delete_route = function (email, cb) {
    this.db.del(email, cb);
};
