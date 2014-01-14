// karma - reward nice and penalize naughty mail senders

var ipaddr = require('ipaddr.js');
var redis = require('redis');
var db;

var penalty_days = 1;
var spammy_tlds = [];

exports.register = function () {
    var plugin = this;

    this.register_hook('init_master',  'karma_onInit');
    this.register_hook('init_child',   'karma_onInit');
    this.register_hook('lookup_rdns',  'karma_onConnect');
    this.register_hook('mail',         'karma_onMailFrom');
    this.register_hook('rcpt',         'karma_onRcptTo');
    this.register_hook('data',         'karma_onData');
    this.register_hook('disconnect',   'karma_onDisconnect');
};

exports.karma_onInit = function (next,server) {
    var config     = this.config.get('connect.karma.ini');

    if ( config.main.penalty_days ) penalty_days = config.main.penalty_days;

    if ( ! config.spammy_tlds ) {
        spammy_tlds = {
            'info':-3, 'pw' :-3, 'tw':-3, 'biz':-3,
            'cl'  :-2, 'br' :-2, 'fr':-2, 'be':-2, 'jp':-2, 'no':-2, 'se':-2, 'sg':-2,
        };
    }
    else {
        // TODO: test parsing spammy_tlds from .ini
        for (var i=0; config.main.spammy_tlds.length(); i++) {
            spammy_tlds[i] = config.main.spammy_tlds[i];
        };
    };

    var redis_ip  = '127.0.0.1';
    var redis_port = '6379';
    if ( config.redis ) {
        redis_ip = config.redis.server_ip;
        redis_port = config.redis.server_port;
    };
    db = redis.createClient(redis_port, redis_ip);
    return next();
}

exports.karma_onConnect = function (next, connection) {
    var plugin = this;

    connection.notes.karma = 0;          // defaults
    connection.notes.karma_history = 0;

    var key = 'karma|'+connection.remote_ip;

    db.hgetall(key, function redisResults (err,obj) {
        if (err) {
            connection.logdebug(plugin,"err: "+err);
            return next();
        };

        if (obj === null) {                // first connection by this IP
            db.hmset(key, {'penalty_start_ts': 0, 'naughty': 0, 'nice': 0, 'concurrent':1, 'connections': 1});
            db.expire(key, 86400 * 60);    // expire after 60 days
            connection.logdebug(plugin,"no results");
            return next();
        };

        db.hincrby(key, 'concurrent', 1);
        db.hincrby(key, 'connections', 1); // total connections
        db.expire(key, 86400 * 60);        // extend expiration date

        var history = (obj.nice || 0) - (obj.naughty || 0);
        connection.notes.karma_history = history;

        var summary = obj.naughty+" naughty, "+obj.nice+" nice, "+obj.connections+" connects, "+history+" history";

        if ( config.concurrency ) {
            var reject=0;
            obj.concurrent++;  // add this connection
            if (history < 0 && obj.concurrent > config.concurrency.naughty) reject++;
            if (history > 0 && obj.concurrent > config.concurrency.nice) reject++;
            if (history ==0 && obj.concurrent > config.concurrency.neutral) reject++;
            if (reject) {
                connection.loginfo(plugin, "too many concurrent connections ("+summary+")");
                return next(DENY, "too many connections: "+obj.concurrent);
            };
        };

        if (obj.penalty_start_ts === '0') {
            connection.loginfo(plugin, "no penalty ("+summary+")");
            return next();
        }

        var days_old = (Date.now() - Date.parse(obj.penalty_start_ts)) / 86.4;
        if (days_old >= penalty_days) {
            connection.loginfo(plugin, "penalty expired ("+summary+")");
            return next();
        }

        var left = +( penalty_days - days_old ).toFixed(2);
        var mess = "Bad karma, you can try again in "+left+" more days.";

        return next(DENY, mess);
    });
};

exports.karma_onMailFrom = function (next, connection, params) {
    var plugin = this;
    var mail_from = params[0];
    var from_tld  = mail_from.host.split('.').pop();
    // connection.logdebug(plugin, "from_tld: "+from_tld);

    var karma_penalty = spammy_tlds[from_tld] || 0;
    if (karma_penalty) {
        connection.logdebug(plugin, "spammy TLD award: "+karma_penalty);
        connection.notes.karma -= karma_penalty;
    };

    var full_from = connection.transaction.mail_from_raw;
    connection.logdebug(plugin, "mail_from raw: "+full_from);

// test if sender has placed an illegal RFC (2)821 space in envelope from
    if ( full_from.toUpperCase().substring(0,6) !== 'FROM:<' ) {
        connection.loginfo(plugin, "illegal envelope address format: "+full_from );
        connection.notes.karma -= karma_penalty;
    };

    connection.loginfo(plugin, "karma score: "+ connection.notes.karma );
    return next();
};

exports.karma_onRcptTo = function (next, connection, params) {
    var plugin = this;

    var rcpt = params[0];
    var full_rcpt = connection.transaction.rcpt_to_raw;

    // check for an illegal RFC (2)821 space in envelope recipient
    if ( full_rcpt.toUpperCase().substring(0,4) !== 'TO:<' ) {
        connection.loginfo(plugin, "illegal envelope address format: "+full_rcpt );
        connection.notes.karma -= karma_penalty;
    };

    var count = connection.rcpt_count.accept + connection.rcpt_count.tempfail + connection.rcpt_count.reject + 1;
    if ( count <= 1 ) return next();

    connection.loginfo(plugin, "recipient count: "+count );

    var history = connection.notes.karma_history;
    if ( history > 0 ) {
        connection.loginfo(plugin, "good history");
        return next();
    };

    var karma = connection.notes.karma;
    if ( karma > 0 ) {
        connection.loginfo(plugin, "good connection");
        return next();
    };

    connection.loginfo(plugin, "karma score: "+ karma );

    // limit recipients if host has negative or unknown karma
    return next(DENY, "too many recipients for karma "+karma+" (h: "+history+")");
}

exports.karma_onData = function (next, connection) {
// cut off naughty senders at DATA to prevent receiving the message
    var karma = connection.notes.karma;
    if ( karma <= -4 ) {
        return next(DENY, "very bad karma: "+karma);
    };
    return next();
};

exports.karma_onDisconnect = function (next, connection) {
    var plugin = this;

    var key = 'karma|'+connection.remote_ip;
    db.hincrby(key, 'concurrent', -1);

    var karma = connection.notes.karma;
    var history = connection.notes.karma_history;

    if ( !karma ) {
        connection.loginfo(plugin, "neutral, (msg: "+karma+", history: "+history+")");
        return next();
    };

    var config = this.config.get('connect.karma.ini');
    var pos_lim = config.connection_limit.positive || 2;

    if (karma > pos_lim) {
        db.hincrby(key, 'nice', 1);
        connection.loginfo(plugin, "positive, (msg: "+karma+", history: "+history+")");
        return next();
    };

    var negative_limit = config.connection_limit.negative || -3;
    if (karma < negative_limit) {
        db.hincrby(key, 'naughty', 1);
        history--;

        if (history <= config.connection_limit.history_negative) {
            if (history < -5) {
                connection.loginfo(plugin, "penalty box bonus! (msg: "+karma+", history: "+history+")");
                log_mess = ", penalty box bonus!";
                db.hset(key, 'penalty_start_ts', addDays(Date(), history * -1 ) );
            }
            else {
                db.hset(key, 'penalty_start_ts', Date());
            }
            connection.loginfo(plugin, "penalty box! (msg: "+karma+", history: "+history+")");
            next();
        }
    }
    connection.loginfo(plugin, "no action, msg: "+karma+", history: "+history+")");
    next();
};

function addDays(date, days) {
    var result = new Date(date);
    result.setDate(date.getDate() + days);
    return result;
}

