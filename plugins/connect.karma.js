// karma - reward nice and penalize naughty mail senders

var ipaddr = require('ipaddr.js');
var redis = require('redis');
var db;

exports.register = function () {
    var plugin = this;

    this.register_hook('init_master',  'karma_onInit');
    this.register_hook('init_child',   'karma_onInit');
    this.register_hook('lookup_rdns',  'karma_onConnect');
    this.register_hook('mail',         'karma_onMailFrom');
    this.register_hook('rcpt',         'karma_onRcptTo');
    this.register_hook('data',         'karma_onData');
    this.register_hook('data_post',    'karma_onDataPost');
    this.register_hook('disconnect',   'karma_onDisconnect');
};

exports.karma_onInit = function (next,server) {
    var config     = this.config.get('connect.karma.ini');
    var redis_ip  = '127.0.0.1';
    var redis_port = '6379';
    if ( config.redis ) {
        redis_ip = config.redis.server_ip;
        redis_port = config.redis.server_port;
    };
    db = redis.createClient(redis_port, redis_ip);
    return next();
};

exports.karma_onConnect = function (next, connection) {
    var plugin = this;
    var config = this.config.get('connect.karma.ini');

    connection.notes.karma = {
        connection: 0,
        history: 0,
        penalties: [ ],
    };

    var key = 'karma|'+connection.remote_ip;
    var con_key = 'concurrent|'+connection.remote_ip;

    function initRemoteIP () {
        db.multi()
            .hmset(key, {'penalty_start_ts': 0, 'naughty': 0, 'nice': 0, 'connections': 1})
            .expire(key, 86400 * 60)   // expire after 60 days
            .exec();
        connection.logdebug(plugin,"first connect");
    };

    db.multi()
        .get(con_key)
        .hgetall(key)
        .exec( function redisResults (err,replies) {
            if (err) {
                connection.logdebug(plugin,"err: "+err);
                return next();
            };

            if (replies[1] === null) { initRemoteIP(); return next(); };

            db.hincrby(key, 'connections', 1); // total connections
            db.expire(key, 86400 * 60);        // extend expiration date

            var kobj = replies[1];
            var history = (kobj.nice || 0) - (kobj.naughty || 0);
            connection.notes.karma.history = history;

            var summary = kobj.naughty+" naughty, "+kobj.nice+" nice, "+kobj.connections+" connects, "+history+" history";

            var too_many = checkConcurrency(plugin, con_key, replies[0], history);
            if ( too_many ) {
                connection.loginfo(plugin, too_many + ", ("+summary+")");
                return next(DENYSOFT, too_many);
            };

            if (kobj.penalty_start_ts === '0') {
                connection.loginfo(plugin, "no penalty "+karmaSummary(connection));
                return next();
            }

            var days_old = (Date.now() - Date.parse(kobj.penalty_start_ts)) / 86.4;
            var penalty_days = config.main.penalty_days;
            if (days_old >= penalty_days) {
                connection.loginfo(plugin, "penalty expired "+karmaSummary(connection));
                return next();
            }

            var left = +( penalty_days - days_old ).toFixed(2);
            var mess = "Bad karma, you can try again in "+left+" more days.";

            return next(DENY, mess);
        });
};

exports.karma_onDeny = function (next, connection, params) {
    /* params
    ** [0] = plugin return value (constants.deny or constants.denysoft)
    ** [1] = plugin return message
    */

    var pi_name     = params[2];
    var pi_function = params[3];
    var pi_params   = params[4];
    var pi_hook     = params[5];

    var plugin = this;
    var transaction = connection.transaction;

    connection.notes.karma.connection--;
    connection.notes.karma.penalties.push(pi_plugin);

    connection.loginfo(plugin, 'deny, '+karmaSummary(connection));

    return next();
};

exports.karma_onMailFrom = function (next, connection, params) {
    var plugin = this;
    var config = this.config.get('connect.karma.ini');

    var mail_from = params[0];
    var from_tld  = mail_from.host.split('.').pop();
    connection.logdebug(plugin, "from_tld: "+from_tld);

    if ( config.spammy_tlds ) {
        var tld_penalty = (config.spammy_tlds[from_tld] || 0) * 1; // force numeric

        if (tld_penalty !== 0) {
            connection.loginfo(plugin, "spammy TLD award: "+tld_penalty);
            connection.notes.karma.connection += tld_penalty;
        };
    };

    var full_from = connection.current_line;
    connection.logdebug(plugin, "mail_from: "+full_from);

// test if sender has placed an illegal (RFC 5321,2821,821) space in envelope from
    if ( full_from.toUpperCase().substring(0,11) !== 'MAIL FROM:<' ) {
        connection.loginfo(plugin, "illegal envelope address format: "+full_from );
        connection.notes.karma.connection--;
        connection.notes.karma.penalties.push('rfc5321.MailFrom');
    };

    connection.loginfo(plugin, karmaSummary(connection));
    return next();
};

exports.karma_onRcptTo = function (next, connection, params) {
    var plugin = this;

    var rcpt = params[0];
    var full_rcpt = connection.current_line;

    // check for an illegal RFC (2)821 space in envelope recipient
    if ( full_rcpt.toUpperCase().substring(0,9) !== 'RCPT TO:<' ) {
        connection.loginfo(plugin, "illegal envelope address format: "+full_rcpt );
        connection.notes.karma.connection--;
        connection.notes.karma.penalties.push('rfc5321.RcptTo');
    };

    var count = connection.rcpt_count.accept + connection.rcpt_count.tempfail + connection.rcpt_count.reject + 1;
    if ( count <= 1 ) return next();

    connection.loginfo(plugin, "recipient count: "+count );

    var history = connection.notes.karma.history;
    if ( history > 0 ) {
        connection.loginfo(plugin, "good history");
        return next();
    };

    var karma = connection.notes.karma.connection;
    if ( karma > 0 ) {
        connection.loginfo(plugin, "good connection");
        return next();
    };

    connection.loginfo(plugin, karmaSummary(connection));

    // limit recipients if host has negative or unknown karma
    return next(DENY, "too many recipients for poor karma: "+karmaSummary(connection));
}

exports.karma_onData = function (next, connection) {
// cut off naughty senders at DATA to prevent receiving the message
    var config = this.config.get('connect.karma.ini');
    var negative_limit = config.threshhold.negative || -5;
    var karma = connection.notes.karma * 1;

    if ( karma.connection <= negative_limit ) {
        return next(DENY, "very bad karma: "+karma);
    }

    return next();
}

exports.karma_onDataPost = function (next, connection) {
    connection.transaction.add_header('X-Haraka-Karma',
        karmaSummary(connection)
    );
    return next();
}

exports.karma_onDisconnect = function (next, connection) {
    var plugin = this;
    var config = this.config.get('connect.karma.ini');

    var key = 'karma|'+connection.remote_ip;

    if ( config.concurrency ) db.incrby('concurrent|'+connection.remote_ip, -1);

    var k = connection.notes.karma;
    if ( !k ) {
        connection.loginfo(plugin, "error: karma note missing!");
        return next();
    };
    var history = k.history;

    if ( !k.connection ) {
        connection.loginfo(plugin, "neutral: "+karmaSummary(connection));
        return next();
    };

    var pos_lim = config.threshhold.positive || 2;

    if (k.connection > pos_lim) {
        db.hincrby(key, 'nice', 1);
        connection.loginfo(plugin, "positive: "+karmaSummary(connection));
        return next();
    };

    var negative_limit = config.threshhold.negative || -3;
    if (k.connection < negative_limit) {
        db.hincrby(key, 'naughty', 1);
        // connection.notes.karma.penalties.push('history');
        history--;

        if (history <= config.threshhold.history_negative) {
            if (history < -5) {
                connection.loginfo(plugin, "penalty box bonus! "+karmaSummary(connection));
                log_mess = ", penalty box bonus!";
                db.hset(key, 'penalty_start_ts', addDays(Date(), history * -1 ) );
            }
            else {
                db.hset(key, 'penalty_start_ts', Date());
            }
            connection.loginfo(plugin, "penalty box! "+karmaSummary(connection));
            next();
        }
    }
    connection.loginfo(plugin, "no action, "+karmaSummary(connection));
    next();
};

function karmaSummary(c) {
    var k = c.notes.karma;
    return '('+
        'conn:'+k.connection+
        ', hist: '+k.history+
        ', penalties: '+k.penalties+
        ')';
}

function addDays(date, days) {
    var result = new Date(date);
    result.setDate(date.getDate() + days);
    return result;
}

function checkConcurrency(plugin, con_key, val, history) {
    var config = plugin.config.get('connect.karma.ini');

    if ( !config.concurrency ) return;

    var count = val || 0;    // add this connection
    count++;
    db.incr(con_key);        // increment Redis, (creates if needed)
    db.expire(con_key, 4 * 60);     // expire after 4 min

    var reject=0;
    if (history <  0 && count > config.concurrency.naughty) reject++;
    if (history >  0 && count > config.concurrency.nice)    reject++;
    if (history == 0 && count > config.concurrency.neutral) reject++;
    if (reject) return "too many connections for you: "+count;
    return;
};
