// karma - reward good and penalize bad mail senders

var ipaddr = require('ipaddr.js');
var redis = require('redis');
var db;
var phase_prefixes = ['connect','helo','mail_from','rcpt_to','data'];

exports.register = function () {
    var plugin = this;
    this.inherits('note');

    this.register_hook('init_master',  'karma_init');
    this.register_hook('init_child',   'karma_init');
    this.register_hook('deny',         'karma_onDeny');
    this.register_hook('lookup_rdns',  'karma_onConnect');
    this.register_hook('mail',         'karma_onMailFrom');
    this.register_hook('rcpt',         'karma_onRcpt');
    this.register_hook('data',         'karma_onData');
    this.register_hook('data_post',    'karma_onDataPost');
    this.register_hook('disconnect',   'karma_onDisconnect');
};

exports.karma_init = function (next, server) {
    init_redis_connection(this);
    return next();
};

function init_redis_connection(plugin) {
    if (db && db.ping()) return;   // connection is good

    var config     = plugin.config.get('karma.ini');
    var redis_ip  = '127.0.0.1';
    var redis_port = '6379';
    if (config.redis) {
        redis_ip = config.redis.server_ip || '127.0.0.1';
        redis_port = config.redis.server_port || '6379';
    }

    db = redis.createClient(redis_port, redis_ip);
    db.on('error', function (error) {
        plugin.logerror('Redis error: ' + error.message);
        db.end();
        db = null;
    });
}

function note_init (connection, config, obj) {
    if (connection.notes.karma) return; // init once per connection
    connection.notes.karma = {
        pass: [],
        fail: [],
        msg: [],
        err: [],
        skip: [],
        hide: (obj && obj.hide) ? obj.hide : [ 'todo' ],
        order: (obj && obj.order) ? obj.order : [],

        connect: 0,       // score on this connection
        history: 0,       // score of past connections (good minus bad)
        total_connects: 0,
        todo: [],         // internal 'todo' list, for awards
    };

    // todo is a list of connection/transaction notes to 'watch' for.
    // When discovered, award their karma points to the connection
    // and remove them from todo.
    if (!config.awards) return;
    Object.keys(config.awards).forEach(function(key) {
        var award = config.awards[key].toString();
        server.logprotocol(this, "key: " + key + ' award: ' + award);
        connection.notes.karma.todo.push(key+'|'+award);
    });
}

function init_ip (dbkey, cckey, expire) {
    db.multi()
        .hmset(dbkey, {'penalty_start_ts': 0, 'bad': 0, 'good': 0, 'connections': 1})
        .expire(dbkey, expire)
        .set(cckey, 1)
        .expire(cckey, 4 * 60)        // expire after 4 min
        .exec();
}

function init_asn (asnkey, expire) {
    db.multi()
        .hmset(asnkey, {'bad': 0, 'good': 0, 'connections': 1})
        .expire(asnkey, expire * 2)    // keep ASN longer
        .exec();
}

exports.check_asn_neighborhood = function (connection, asnkey, expire) {
    var plugin = this;
    db.hgetall(asnkey, function (err, res) {
        if (err) {
            plugin.note({conn: connection, err: err, emit: true});
            return;
        }

        if (res === null) {
            init_asn(asnkey, expire);
            return;
        }

        db.hincrby(asnkey, 'connections', 1);
        var net_score = parseFloat(res.good || 0) - (res.bad || 0);
        plugin.note({conn: connection, neighborhood: net_score, emit: true});
        return;
    });
};

exports.karma_onConnect = function (next, connection) {
    var plugin = this;
    var config = plugin.config.get('karma.ini');

    init_redis_connection(plugin);
    note_init(connection, config);

    var expire = (config.main.expire_days || 60) * 86400; // convert to days
    var rip   = connection.remote_ip;
    var dbkey = 'karma|' + rip;
    var cckey = 'concurrent|' + rip;
    var asnkey;
    if (config.main.enable_asn && connection.notes['connect.asn']) {
        asnkey = connection.notes['connect.asn'].asn;
        if (isNaN(asnkey)) asnkey = undefined;
        if (asnkey) plugin.check_asn_neighborhood(connection, asnkey, expire);
    }

    db.multi()
        .get(cckey)
        .hgetall(dbkey)
        .exec(function redisResults (err,replies) {
            if (err) {
                plugin.note({conn: connection, err: err, emit: true});
                return next();
            }

            var dbr = replies[1];   // 2nd pos. of redis reply is karma object
            if (dbr === null) { init_ip(dbkey, cckey, expire); return next(); }

            db.multi()
                .hincrby(dbkey, 'connections', 1)  // increment total connections
                .expire(dbkey, expire)             // extend expiration date
                .incr(cckey)                       // increment concurrent connections
                .exec(function (err,replies) {
                    if (err) plugin.note({conn: connection, err: err, emit: true});
                });

            var history = (dbr.good || 0) - (dbr.bad || 0);

            plugin.note({conn: connection, history: history, total_connects: dbr.connections});

            var too_many = plugin.check_concurrency(cckey, replies[0], history);
            if (too_many) {
                plugin.note({conn: connection, fail: 'too_many_connects'});
                return next(DENYSOFTDISCONNECT, too_many);
/*  This causes "karma plugin ran callback multiple times" errors
                var delay = config.concurrency.disconnect_delay || 10;
                setTimeout(function ccr_max_to () {
                    return next(DENYSOFTDISCONNECT, too_many);
                }, delay * 1000);
*/
            }

            if (dbr.penalty_start_ts === '0') {
                plugin.note({conn: connection, skip: 'penalty'});
                return next();
            }

            var ms_old = (Date.now() - Date.parse(dbr.penalty_start_ts));
            var days_old = (ms_old / 86400 / 1000).toFixed(2);
            plugin.note({conn: connection, msg: 'days_old: ' + days_old});

            var penalty_days = config.main.penalty_days;
            if (days_old >= penalty_days) {
                plugin.note({conn: connection, msg: 'penalty expired'});
                return next();
            }

            plugin.note({conn: connection, fail: 'penalty'});

            var left = +(penalty_days - days_old).toFixed(2);
            var mess = "Bad karma, you can try again in " + left + " more days.";
            return next(DENYDISCONNECT, mess);
        });

    plugin.check_awards(connection);
};

exports.karma_onDeny = function (next, connection, params) {
    var plugin = this;
    var pi_deny     = params[0];  // (constants.deny, denysoft, ok)
    var pi_message  = params[1];
    var pi_name     = params[2];
    var pi_function = params[3];
    var pi_params   = params[4];
    var pi_hook     = params[5];

    var config = plugin.config.get('karma.ini');
    note_init(connection, config); // deny may get called b4 connect

    if (pi_deny === DENY || pi_deny === DENYDISCONNECT || pi_deny === DISCONNECT) {
        plugin.tweak(connection, -2);
    }
    else {
        plugin.tweak(connection, -1);
    }
    plugin.note({conn: connection, fail: 'deny:' + pi_name});

    plugin.check_awards(connection);
    return next();
};

exports.karma_onMailFrom = function (next, connection, params) {
    var plugin = this;

    plugin.check_spammy_tld(params[0], connection);
    plugin.check_syntax_mailfrom(connection);

    plugin.check_awards(connection);
    plugin.note({conn: connection, emit: 1});
    return next();
};

exports.karma_onRcpt = function (next, connection, params) {
    var plugin = this;
    var rcpt = params[0];

    plugin.check_syntax_RcptTo(connection);
    var too_many = plugin.max_recipients(connection);
    if (too_many) {
        plugin.note({conn: connection, fail: 'too_many_rcpt'});
        return next(DENYSOFT, too_many);
    }

    plugin.check_awards(connection);
    return next();
};

exports.hook_rcpt_ok = function (next, connection, rcpt) {
    var plugin = this;

    plugin.check_syntax_RcptTo(connection);
    var too_many = plugin.max_recipients(connection);
    if (too_many) {
        plugin.note({conn: connection, fail: 'too_many_rcpt'});
        return next(DENYSOFT, too_many);
    }

    plugin.check_awards(connection);
    return next();
};

exports.karma_onData = function (next, connection) {
    // goal: cut off bad senders before message transmission

    var config = this.config.get('karma.ini');
    this.check_awards(connection);

    var negative_limit = parseFloat(config.thresholds.negative) || -5;
    var score = parseFloat(connection.notes.karma.connect);

    if (score <= negative_limit) {
        return next(DENYDISCONNECT, "very bad karma score: " + score);
    }

    return next();
};

exports.karma_onDataPost = function (next, connection) {
    // goal: prevent delivery of spam
    var plugin = this;
    var config = plugin.config.get('karma.ini');
    plugin.check_awards(connection);

    var negative_limit = parseFloat(config.thresholds.negative) || -5;
    var score = parseFloat(connection.notes.karma.connect);
    if (score <= negative_limit) {
        return next(DENY, "very bad karma score: " + score);
    }

    connection.transaction.add_header('X-Haraka-Karma',
        plugin.note_collate({conn: connection})
    );

    return next();
};

exports.hook_queue = function (next, connection) {
    var config = this.config.get('karma.ini');
    this.check_awards(connection);

    var negative_limit = parseFloat(config.thresholds.negative) || -5;
    var score = parseFloat(connection.notes.karma.connect);

    if (score <= negative_limit) {
        return next(DENY, "bad karma score: " + score);
    }

    return next();
};

exports.karma_onDisconnect = function (next, connection) {
    var plugin = this;
    var config = plugin.config.get('karma.ini');

    init_redis_connection(plugin);
    if (config.concurrency) db.incrby('concurrent|' + connection.remote_ip, -1);

    var asnkey;
    if (config.main.enable_asn && connection.notes['connect.asn']) {
        asnkey = connection.notes['connect.asn'].asn;
        if (isNaN(asnkey)) asnkey = undefined;
    }

    var k = connection.notes.karma;
    if (!k) {
        plugin.note({conn: connection, err: 'karma note missing!', emit: true });
        return next();
    }

    if (!k.connect) {
        plugin.note({conn: connection, msg: 'neutral', emit: true });
        return next();
    }

    var key = 'karma|' + connection.remote_ip;
    var history = k.history;

    if (config.thresholds) {
        var pos_lim = config.thresholds.positive || 2;

    var pos_lim = config.thresholds.positive || 2;

    if (k.connect > pos_lim) {
        db.hincrby(key, 'good', 1);
        if (asnkey) db.hincrby(asnkey, 'good', 1);
        plugin.note({conn: connection, msg: 'positive', emit: true });
        return next();
    }

    var bad_limit = config.thresholds.negative || -3;
    if (k.connect > bad_limit) return next();

    db.hincrby(key, 'bad', 1);
    if (asnkey) db.hincrby(asnkey, 'bad', 1);
    history--;

    if (history > config.thresholds.history_negative) {
        plugin.note({conn: connection, msg: 'good enough hist', emit: true });
        return next();
    }

    if (history < -5) {
        db.hset(key, 'penalty_start_ts', add_days(history * -1));
        plugin.note({conn: connection, msg: 'penalty box bonus!', emit: true });
    }
    else {
        db.hset(key, 'penalty_start_ts', Date());
        plugin.note({conn: connection, msg: 'penalty box', emit: true });
    }
    return next();
};

exports.tweak = function (connection, qty) {
    if (isNaN(qty)) {
        connection.logerror(this, "invalid argument to tweak: " + qty);
        return;
    }
    var k = connection.notes.karma;
    k.connect = +(k.connect + qty);
};

exports.check_awards = function (connection) {
    var plugin = this;
    if (!connection.notes.karma) return;
    if (!connection.notes.karma.todo) return;
    if (!plugin) plugin = connection;

    var todo = connection.notes.karma.todo;
    for (var i=0; i < todo.length; i++) {
        // note_location [@wants] | award [conditions]
        if (todo[i] === undefined) continue;  // already deleted

        var bits = todo[i].split('|');
        var note_location = bits[0];
        var note_terms = bits[1];

            bits = note_location.split('@');
        var wants;
        if (bits.length === 2) {  // optional value to match
            note_location = bits[0];  // remove @... suffix from note
            wants = bits[1];
        }

        // locate the object in the requested note location
        var note = assemble_note_obj(connection, note_location);
        if (note === undefined) {
            connection.logprotocol(plugin, "no conn note: " + note_location);
            if (!connection.transaction) continue;
            note = assemble_note_obj(connection.transaction, note_location);
            if (note === undefined) {
                connection.logprotocol(plugin, "no txn  note: " + note_location);
                continue;
            }
        }

        // test the desired condition
        bits = note_terms.split(/\s+/);
        connection.logprotocol(plugin, "bits, " + bits);
        var award = parseFloat(bits[0]);
        var condition = bits[2];

        if (!bits[1] || bits[1] !== 'if') {      // no if conditions
            if (!note) continue;                 // failed truth test
            if (!wants || wants === undefined) { // no wants, truth matches
                plugin.apply_award(connection, note_location, award);
                delete connection.notes.karma.todo[i];
                continue;
            }
            if (note !== wants) continue;        // didn't match
        }

        if (condition.match(/^(equals|gt|lt|match)$/)) {
            if (bits[3] && bits[3] !== undefined) wants = bits[3];
            connection.logprotocol(plugin, "matched "+condition+" to wants: " + wants+" from "+note);
        }

        // the matching logic is inverted here, weeding out anything that
        // doesn't match. Matches fall through to the apply_award below.
        switch (condition) {
            case 'equals':
                if (wants !== note) continue;
                break;
            case 'gt':
                if (parseFloat(note) <= parseFloat(wants)) continue;
                break;
            case 'lt':
                if (parseFloat(note) >= parseFloat(wants)) continue;
                break;
            case 'match':
                if (!note.toString().match(new RegExp(wants, 'i'))) continue;
                break;
            case 'length':
                var operator = bits[3];
                var length   = note.length;
                if (bits[4] && bits[4] !== undefined) wants = bits[4];
                switch (operator) {
                    case 'gt':
                        if (note.length <= parseFloat(wants)) continue;
                        break;
                    case 'lt':
                        if (note.length >= parseFloat(wants)) continue;
                        break;
                    case 'equals':
                        if (note.length !== parseFloat(wants)) continue;
                        break;
                    default:
                        connection.logerror(plugin, 'length operator "' + operator + '" not supported.');
                        continue;   // not supported!
                }
                break;
            case 'element':
                continue;  // not supported, yet.
            default:
                continue;
        }
        plugin.apply_award(connection, note_location, award);
        delete connection.notes.karma.todo[i];
    }
};

exports.apply_award = function (connection, nl, award) {
    var plugin = this;
    if (!award) return;
    if (isNaN(award)) {
        connection.loginfo(plugin, "non-numeric award from: " + nl + ':' + award);
        return;  // garbage in config
    }

    plugin.tweak(connection, award);
    connection.loginfo(plugin, "applied " + nl + ':' + award);

    var trimmed = nl.substring(0,5) === 'notes' ? nl.substring(6) : nl;
    if (award > 0) { connection.notes.karma.pass.push(trimmed); }
    if (award < 0) { connection.notes.karma.fail.push(trimmed); }
};

function add_days(days) {
    var now = new Date();
    var target = new Date();
    target.setDate(now.getDate() + days);
    return target;
}

exports.check_concurrency = function (con_key, val, history) {
    var config = this.config.get('karma.ini');

    if (!config.concurrency) return;

    var count = val || 0;
    count++;                 // add this connection

    var reject=0;
    if (history  <  0 && count > config.concurrency.bad) reject++;
    if (history  >  0 && count > config.concurrency.good) reject++;
    if (history === 0 && count > config.concurrency.neutral) reject++;
    if (reject) return "too many connections for you: " + count;
    return;
};

exports.max_recipients = function (connection) {
    var plugin = this;
    var cr = plugin.config.get('karma.ini').recipients;
    if (!cr) return;           // disabled in config file
    var c = connection.rcpt_count;
    var count = c.accept + c.tempfail + c.reject + 1;
    if (count < 2) return;           // everybody is allowed one

    connection.logdebug(plugin, "recipient count: " + count );

    var desc = history > 3 ? 'good' : history >= 0 ? 'neutral' : 'bad';

    // the deeds of their past shall not go unnoticed!
    var history = connection.notes.karma.history;
    if (history > 3 && count <= cr.good) return;
    if (history > -1 && count <= cr.neutral) return;

    // this is *more* strict than history, b/c they have fewer opportunities
    // to score positive karma this early in the connection. senders with
    // good history will rarely see these limits.
    var karma = connection.notes.karma.connect;
    if (karma >  3 && count <= cr.good) return;
    if (karma >= 0 && count <= cr.neutral) return;

    return 'too many recipients (' + count + ') for ' + desc + ' karma';
};

exports.check_spammy_tld = function (mail_from, connection) {
    var plugin = this;
    var stlds = plugin.config.get('karma.ini').spammy_tlds;
    if (!stlds) return;
    if (mail_from.isNull()) return;              // null sender (bounce)

    var from_tld = mail_from.host.split('.').pop();
    connection.logprotocol(plugin, "from_tld: " + from_tld);

    var tld_penalty = parseFloat(stlds[from_tld] || 0); // force numeric
    if (tld_penalty === 0) return;

    plugin.tweak(connection, tld_penalty);
    plugin.note({conn: connection, fail: 'spammy.TLD', emit: true});
};

exports.check_syntax_mailfrom = function (connection) {
    var plugin = this;
    var full_from = connection.current_line;
    // connection.logdebug(plugin, "mail_from: " + full_from);

    // look for an illegal (RFC 5321,2821,821) space in envelope from
    if (full_from.toUpperCase().substring(0,11) === 'MAIL FROM:<') return;

    connection.loginfo(plugin, "illegal envelope address format: " + full_from );
    plugin.tweak(connection, -1);
    plugin.note({conn: connection, fail: 'rfc5321.MailFrom'});
};

exports.check_syntax_RcptTo = function (connection) {
    var plugin = this;

    // check for an illegal RFC (2)821 space in envelope recipient
    var full_rcpt = connection.current_line;
    if (full_rcpt.toUpperCase().substring(0,9) === 'RCPT TO:<') return;

    connection.loginfo(plugin, "illegal envelope address format: " + full_rcpt );
    plugin.tweak(connection, -1);
    plugin.note({conn: connection, fail: 'rfc5321.RcptTo'});
};

function assemble_note_obj(prefix, key) {
    var note = prefix;
    var parts = key.split('.');
    while(parts.length > 0) {
        var next = parts.shift();
        if (phase_prefixes.indexOf(next) !== -1) {
            next = next + '.' + parts.shift();
        }
        note = note[next];
        if (note == null) break;
    }
    return note;
}
