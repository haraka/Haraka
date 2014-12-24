// rcpt_to.routes - per email/domain mail routes
//
// validates incoming recipients against flat file & Redis
// routes mail based on per-email or per-domain specified routes

var redis;

exports.register = function() {
    var plugin = this;
    plugin.cfg = {};
    plugin.route_list={};

    plugin.load_config();

    try { redis = require('redis'); }
    catch (e) {
        plugin.logerror("unable to load redis.\ndid you: npm install -g redis?");
    }

    if (redis) { plugin.init_redis_connection(); }

    plugin.register_hook('rcpt',   'rcpt');
    plugin.register_hook('get_mx', 'get_mx');
};

exports.load_config = function () {
    var plugin = this;
    plugin.cfg = plugin.config.get('rcpt_to.routes.ini', function () {
        plugin.load_config();
    });

    var lowered = {};
    if (plugin.cfg.routes) {
        var keys = Object.keys(plugin.cfg.routes);
        for (var i=0; i < keys.length; i++) {
            lowered[keys[i].toLowerCase()] = plugin.cfg.routes[keys[i]];
        }
        plugin.route_list = lowered;
    }
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

    var do_file_search = function () {
        if (plugin.route_list[address]) {
            txn.results.add(plugin, {pass: 'file.email'});
            return next(OK);
        }
        if (plugin.route_list[domain])  {
            txn.results.add(plugin, {pass: 'file.domain'});
            return next(OK);
        }

        // not permitted (by this rcpt_to plugin)
        txn.results.add(plugin, {fail: 'file'});
        return next();
    };

    // if we can't use redis, try files and return
    if (!redis || !plugin.redis_pings) { return do_file_search(); }

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
            if (replies[0]) {
                txn.results.add(plugin, {pass: 'redis.email'});
                return next(OK);
            }
            if (replies[1]) {
                txn.results.add(plugin, {pass: 'redis.domain'});
                return next(OK);
            }

            return do_file_search(); // no redis record, try files
        });
};

exports.get_mx = function(next, hmail, domain) {
    var plugin = this;

    // get email address
    var address = domain;
    if (hmail && hmail.todo && hmail.todo.rcpt_to && hmail.todo.rcpt_to[0]) {
        address = hmail.todo.rcpt_to[0].address();
    }
    else {
        plugin.logerror('no rcpt from hmail, falling back to domain' );
    }

    var do_file_search = function () {
        // check email adress for route
        if (plugin.route_list[address]) {
            return next(OK, plugin.route_list[address]);
        }

        // check email domain for route
        if (plugin.route_list[domain]) {
            return next(OK, plugin.route_list[domain]);
        }

        plugin.loginfo('using DNS MX for: ' + address);
        return next();
    };

    // if we can't use redis, try files and return
    if (!redis || !plugin.redis_pings) { return do_file_search(); }

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

            return do_file_search(); // no redis record, try files
        });
};

// Redis DB functions
exports.init_redis_connection = function () {
    var plugin = this;
    if (plugin.db) {
        return true;
    }

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
    if (redis_db) { plugin.db.select(redis_db); }
    // plugin.db.on('connect', function () {
    //     maybe do stuff here when the Redis connection is completed
    // });
};

exports.redis_ping = function(cb) {
    var plugin = this;
    var nope = function () {
        cb();
        plugin.redis_pings=false;
        return false;
    };

    if (!plugin.db) { return nope(); }

    plugin.db.ping(function (err, res) {
        if (err           ) { return nope(); }
        if (res !== 'PONG') { return nope(); }
        plugin.redis_pings=true;
        cb();
        return true;
    });
};

exports.insert_route = function (email, route) {
    // for importing, see http://redis.io/topics/mass-insert
    if (!this.db || !this.redis_pings) { return false; }
    this.db.set(email, route);
};

exports.delete_route = function (email, cb) {
    if (!this.db || !this.redis_pings) {
        if (cb) cb();
        return false;
    }
    if (cb) {
        this.db.del(email, cb);
    }
    else {
        this.db.del(email);
    }
};
