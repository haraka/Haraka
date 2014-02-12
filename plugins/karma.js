// karma - reward good and penalize bad mail senders

var ipaddr = require('ipaddr.js');
var redis  = require('redis');
var db;
var phase_prefixes = ['connect','helo','mail_from','rcpt_to','data'];

exports.register = function () {
    this.register_hook('init_master',  'karma_init');
    this.register_hook('init_child',   'karma_init');
    this.register_hook('deny',         'karma_onDeny');
    this.register_hook('mail',         'karma_onMailFrom');
    this.register_hook('rcpt',         'karma_onRcpt');
};

exports.karma_init = function (next, server) {
    this.init_redis_connection();
    return next();
};

exports.init_redis_connection = function () {
    var plugin = this;
    // this is called during init, lookup_rdns, and disconnect
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
        plugin.logerror(plugin, 'Redis error: ' + error.message);
        db = null;
    });
};

exports.note_init = function (connection) {
    var plugin = this;
    var config = plugin.config.get('karma.ini');
    if (connection.notes.karma) return; // init once per connection

    // connect: score on this connection
    // history: score of past connections (good minus bad)
    connection.results.add(plugin, {connect:0, history:0, total_connects:0});

    // todo is a list of connection/transaction notes to 'watch' for.
    // When discovered, award their karma points to the connection
    // and remove them from todo.
    if (!config.awards) return;
    var todo = {};
    Object.keys(config.awards).forEach(function(key) {
        var award = config.awards[key].toString();
        server.logprotocol(this, "key: " + key + ' award: ' + award);
        todo[key] = award;
    });
    connection.results.add(plugin, {todo: todo});
};

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

function karma_result( ) {

}

exports.check_asn_neighborhood = function (connection, asnkey, expire) {
    var plugin = this;
    db.hgetall(asnkey, function (err, res) {
        if (err) {
            connection.results.add(plugin, {err: err});
            return;
        }

        if (res === null) {
            init_asn(asnkey, expire);
            return;
        }

        db.hincrby(asnkey, 'connections', 1);
        var net_score = parseFloat(res.good || 0) - (res.bad || 0);
        if (!net_score) return;
        connection.results.add(plugin, {neighbors: net_score, emit: true});

        if (!plugin.config.get('karma.ini').asn_awards) return;
        if (net_score < -5) {
            connection.results.add(plugin, {fail: 'neighbors(asn)'});
            return;
        }
        if (net_score > 5) {
            connection.results.add(plugin, {pass: 'neighbors(asn)'});
        }
        return;
    });
};

exports.hook_lookup_rdns = function (next, connection) {
    var plugin = this;

    plugin.init_redis_connection();
    plugin.note_init(connection);

    var config = plugin.config.get('karma.ini');
    var expire = (config.main.expire_days || 60) * 86400; // convert to days
    var rip    = connection.remote_ip;
    var dbkey  = 'karma|' + rip;
    var cckey  = 'concurrent|' + rip;
    var asnkey;
    if (config.main.asn_enable && connection.results.get('connect.asn')) {
        asnkey = connection.results.get('connect.asn').asn;
        if (isNaN(asnkey)) asnkey = undefined;
        if (asnkey) plugin.check_asn_neighborhood(connection, asnkey, expire);
    }

    db.multi()
        .get(cckey)
        .hgetall(dbkey)
        .exec(function redisResults (err,replies) {
            if (err) {
                connection.results.add(plugin, {err: err});
                return next();
            }

            var dbr = replies[1];   // 2nd pos. of redis reply is karma object
            if (dbr === null) { init_ip(dbkey, cckey, expire); return next(); }

            db.multi()
                .hincrby(dbkey, 'connections', 1)  // increment total connections
                .expire(dbkey, expire)             // extend expiration date
                .incr(cckey)                       // increment concurrent connections
                .exec(function (err,replies) {
                    if (err) connection.results.add(plugin, {err: err});
                });

            var history = (dbr.good || 0) - (dbr.bad || 0);
            connection.results.add(plugin, {history: history, total_connects: dbr.connections});

            var too_many = plugin.check_concurrency(cckey, replies[0], history);
            if (too_many) {
                connection.results.add(plugin, {fail: 'too_many_connects'});
                var delay = config.concurrency.disconnect_delay || 10;
                setTimeout(function ccr_max_to () {
                    return next(DENYSOFTDISCONNECT, too_many);
                }, delay * 1000);
                return;
            }

            if (dbr.penalty_start_ts === '0') {
                connection.results.add(plugin, {skip: 'penalty'});
                return next();
            }

            var ms_old = (Date.now() - Date.parse(dbr.penalty_start_ts));
            var days_old = (ms_old / 86400 / 1000).toFixed(2);
            connection.results.add(plugin, {msg: 'days_old: ' + days_old});

            var penalty_days = config.main.penalty_days;
            if (days_old >= penalty_days) {
                connection.results.add(plugin, {msg: 'penalty expired'});
                return next();
            }

            connection.results.add(plugin, {fail: 'penalty'});

            var left = +(penalty_days - days_old).toFixed(2);
            var taunt = config.main.taunt;
            if (!taunt || taunt === undefined) {
                taunt = "Bad karma, you can try again in " + left + " more days.";
            }
            var delay = config.main.penalty_disconnect_delay || 5;
            setTimeout(function penalty_disconnect () {
                return next(DENYDISCONNECT, taunt);
            }, delay * 1000);
            return;
            // return next(DENY, taunt);
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

    if (pi_deny === DENY || pi_deny === DENYDISCONNECT || pi_deny === DISCONNECT) {
        connection.results.incr(plugin, {connect: -2});
    }
    else {
        connection.results.incr(plugin, {connect: -1});
    }
    connection.results.add(plugin, {fail: 'deny:' + pi_name});

    plugin.check_awards(connection);
    return next();
};

exports.karma_onMailFrom = function (next, connection, params) {
    var plugin = this;

    plugin.check_spammy_tld(params[0], connection);
    plugin.check_syntax_mailfrom(connection);

    plugin.check_awards(connection);
    connection.results.add(plugin, {emit: 1});
    return next();
};

exports.hook_unrecognized_command = function(next, connection, cmd) {
    var plugin = this;

    connection.results.incr(plugin, {connect: -1});
    connection.results.add(plugin, { fail: 'cmd:('+cmd+')' });

    plugin.check_awards(connection);

    var config = plugin.config.get('karma.ini');
    var negative_limit = parseFloat(config.thresholds.negative) || -5;
    var score = parseFloat( connection.results.get('karma').connect );

    if (score <= negative_limit) {
        return next(DENY, "very bad karma score: " + score);
    }

    connection.notes.tarpit = 2;

    return next();
};

exports.karma_onRcpt = function (next, connection, params) {
    var plugin = this;
    var rcpt = params[0];

    plugin.check_syntax_RcptTo(connection);
    var too_many = plugin.max_recipients(connection);
    if (too_many) {
        connection.results.add(plugin, {fail: 'too_many_rcpt'});
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
        connection.results.add(plugin, {fail: 'too_many_rcpt'});
        return next(DENYSOFT, too_many);
    }

    plugin.check_awards(connection);
    return next();
};

exports.hook_data = function (next, connection) {
    // goal: cut off bad senders before message transmission

    this.check_awards(connection);

    var config = this.config.get('karma.ini');
    var negative_limit = parseFloat(config.thresholds.negative) || -5;
    var score = parseFloat( connection.results.get('karma').connect );

    if (score <= negative_limit) {
        return next(DENY, "very bad karma score: " + score);
    }

    return next();
};

exports.hook_data_post = function (next, connection) {
    // goal: prevent delivery of spam
    var plugin = this;
    var config = plugin.config.get('karma.ini');
    plugin.check_awards(connection);

    var negative_limit = parseFloat(config.thresholds.negative) || -5;
    var score = parseFloat( connection.results.get('karma').connect );
    if (score <= negative_limit) {
        return next(DENY, "very bad karma score: " + score);
    }

    var results = connection.results.collate(plugin);
    connection.loginfo("adding header: " + results);
    connection.transaction.add_header('X-Haraka-Karma', results);
    return next();
};

exports.hook_queue = function (next, connection) {
    var config = this.config.get('karma.ini');
    this.check_awards(connection);

    var negative_limit = parseFloat(config.thresholds.negative) || -5;
    var score = parseFloat( connection.results.get('karma').connect );

    if (score <= negative_limit) {
        return next(DENY, "bad karma score: " + score);
    }

    return next();
};

exports.hook_disconnect = function (next, connection) {
    var plugin = this;
    var config = plugin.config.get('karma.ini');

    plugin.init_redis_connection();
    if (config.concurrency) db.incrby('concurrent|' + connection.remote_ip, -1);

    var asnkey;
    if (config.main.asn_enable && connection.results.get('connect.asn')) {
        asnkey = connection.results.get('connect.asn').asn;
        if (isNaN(asnkey)) asnkey = undefined;
    }

    var k = connection.results.get('karma');
    if (!k) {
        connection.results.add(plugin, {err: 'karma note missing!'});
        return next();
    }

    if (!k.connect) {
        connection.results.add(plugin, {msg: 'neutral', emit: true});
        return next();
    }

    var key = 'karma|' + connection.remote_ip;
    var history = k.history;

    if (!config.thresholds) {
        plugin.check_awards(connection);
        connection.results.add(plugin, {msg: 'no action', emit: true });
        return next();
    }

    var pos_lim = config.thresholds.positive || 3;

    if (k.connect > pos_lim) {
        db.hincrby(key, 'good', 1);
        if (asnkey) db.hincrby(asnkey, 'good', 1);
        connection.results.add(plugin, {msg: 'positive', emit: true });
        return next();
    }

    var bad_limit = config.thresholds.negative || -5;
    if (k.connect > bad_limit) return next();

    db.hincrby(key, 'bad', 1);
    if (asnkey) db.hincrby(asnkey, 'bad', 1);
    history--;

    if (history > config.thresholds.history_negative) {
        connection.results.add(plugin, {msg: 'good enough hist', emit: true });
        return next();
    }

    if (history < -5) {
        db.hset(key, 'penalty_start_ts', add_days(history * -1));
        connection.results.add(plugin, {msg: 'penalty box bonus!', emit: true});
    }
    else {
        db.hset(key, 'penalty_start_ts', Date());
        connection.results.add(plugin, {msg: 'penalty box', emit: true });
    }
    return next();
};

exports.check_awards = function (connection) {
    var plugin = this;
    var todo = connection.results.get('karma').todo;
    if (!todo) return;

    for (var note_location in todo) {
        // note_location [@wants] = award [conditions]

        var note_terms = todo[note_location];

        var bits = note_location.split('@');
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
                delete todo[note_location];
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
        delete todo[note_location];
    }
};

exports.apply_award = function (connection, nl, award) {
    var plugin = this;
    if (!award) return;
    if (isNaN(award)) {
        connection.loginfo(plugin, "non-numeric award from: " + nl + ':' + award);
        return;  // garbage in config
    }

    connection.results.incr(plugin, {connect: award});
    connection.loginfo(plugin, "applied " + nl + ':' + award);

    var trimmed = nl.substring(0,5) === 'notes' ? nl.substring(6) : nl;
    if (award > 0) { connection.results.add(plugin, {pass: trimmed}); }
    if (award < 0) { connection.results.add(plugin, {fail: trimmed}); }
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
    var history = connection.results.get('karma').history;
    if (history > 3 && count <= cr.good) return;
    if (history > -1 && count <= cr.neutral) return;

    // this is *more* strict than history, b/c they have fewer opportunities
    // to score positive karma this early in the connection. senders with
    // good history will rarely see these limits.
    var score = connection.results.get('karma').connect;
    if (score >  3 && count <= cr.good) return;
    if (score >= 0 && count <= cr.neutral) return;

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

    connection.results.incr(plugin, {connect: tld_penalty});
    connection.results.add(plugin, {fail: 'spammy.TLD', emit: true});
};

exports.check_syntax_mailfrom = function (connection) {
    var plugin = this;
    var full_from = connection.current_line;
    // connection.logdebug(plugin, "mail_from: " + full_from);

    // look for an illegal (RFC 5321,2821,821) space in envelope from
    if (full_from.toUpperCase().substring(0,11) === 'MAIL FROM:<') return;

    connection.loginfo(plugin, "illegal envelope address format: " + full_from );
    connection.results.incr(plugin, {connect: -1});
    connection.results.add(plugin, {fail: 'rfc5321.MailFrom'});
};

exports.check_syntax_RcptTo = function (connection) {
    var plugin = this;

    // check for an illegal RFC (2)821 space in envelope recipient
    var full_rcpt = connection.current_line;
    if (full_rcpt.toUpperCase().substring(0,9) === 'RCPT TO:<') return;

    connection.loginfo(plugin, "illegal envelope address format: " + full_rcpt );
    connection.results.incr(plugin, {connect: -1});
    connection.results.add(plugin, {fail: 'rfc5321.RcptTo'});
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
