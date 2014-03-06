// karma - reward good and penalize bad mail senders

var ipaddr = require('ipaddr.js');
var redis  = require('redis');
var db;
var phase_prefixes = ['connect','helo','mail_from','rcpt_to','data'];
var deny_hooks = ['unrecognized_command','helo','ehlo','mail','rcpt','data','data_post'];

exports.register = function () {
    var plugin = this;
    var cfg = plugin.config.get('karma.ini');
    if (cfg.penalty.hooks) {
        deny_hooks = cfg.penalty.hooks.split(/[\s,;]+/);
    }
    plugin.register_hook('init_master',  'karma_init');
    plugin.register_hook('init_child',   'karma_init');
    plugin.register_hook('ehlo',         'hook_helo');
};

exports.karma_init = function (next, server) {
    this.init_redis_connection();
    return next();
};

exports.results_init = function (connection) {
    var plugin = this;
    var config = plugin.config.get('karma.ini');
    if (connection.results.get('karma')) return; // init once per connection

    // connect: score on this connection
    // history: score of past connections (good minus bad)
    connection.results.add(plugin, {connect:0, history:0, total_connects:0});

    // todo is a list of connection/transaction notes to 'watch' for.
    // When discovered, award their karma points to the connection
    // and remove them from todo.
    if (!config.awards) return;
    var todo = {};
    for (var key in config.awards) {
        var award = config.awards[key].toString();
        todo[key] = award;
    }
    connection.results.add(plugin, {todo: todo});
};

exports.should_we_deny = function (next, connection, hook) {
    var plugin = this;
    plugin.check_awards(connection);  // update awards first

    var config         = plugin.config.get('karma.ini');
    var negative_limit = parseFloat(config.thresholds.negative) || -5;
    var score          = parseFloat(connection.results.get('karma').connect);

    if (score < 0 && config.tarpit) {
        // the worse the connection, the slower it goes...
        var delay = score * -1;
        var max = config.tarpit.max || 5;
        if (delay > max) { delay = max; };
        connection.notes.tarpit = delay;
    }

    if (score > negative_limit)          { return next(); }
    if (deny_hooks.indexOf(hook) === -1) { return next(); }

    return next(DENY, "very bad karma score: " + score);
};

exports.hook_deny = function (next, connection, params) {
    var plugin = this;
    var pi_deny     = params[0];  // (constants.deny, denysoft, ok)
//  var pi_message  = params[1];
    var pi_name     = params[2];
//  var pi_function = params[3];
//  var pi_params   = params[4];
//  var pi_hook     = params[5];

    if (pi_name === 'karma') return next();
    var config = plugin.config.get('karma.ini');

    if (pi_deny === DENY || pi_deny === DENYDISCONNECT || pi_deny === DISCONNECT) {
        connection.results.incr(plugin, {connect: -2});
    }
    else {
        connection.results.incr(plugin, {connect: -1});
    }

    connection.results.add(plugin, {fail: 'deny:' + pi_name});
    return next(OK);
};

exports.hook_unrecognized_command = function(next, connection, cmd) {
    var plugin = this;

    connection.results.incr(plugin, {connect: -1});
    connection.results.add(plugin, {fail: 'cmd:('+cmd+')'});

    return plugin.should_we_deny(next, connection, 'unrecognized_command');
};

exports.hook_lookup_rdns = function (next, connection) {
    var plugin = this;
    var config = plugin.config.get('karma.ini');

    plugin.init_redis_connection();
    plugin.results_init(connection);

    if (config.tarpit) { connection.notes.tarpit = config.tarpit.delay || 0; }

    var expire = (config.redis.expire_days || 60) * 86400; // convert to days
    var rip    = connection.remote_ip;
    var dbkey  = 'karma|' + rip;
    var cckey  = 'concurrent|' + rip;
    var asnkey;
    if (config.asn.enable && connection.results.get('connect.asn')) {
        var asn = connection.results.get('connect.asn');
        if (asn) asnkey = asn.asn;
        if (isNaN(asnkey)) asnkey = undefined;
        if (asnkey) plugin.check_asn_neighborhood(connection, asnkey, expire);
    }

    db.multi()
        .get(cckey)
        .hgetall(dbkey)
        .exec(function redisResults (err, replies) {
            if (err) {
                connection.results.add(plugin, {err: err});
                return next();
            }

            var dbr = replies[1];   // 2nd pos. of multi reply is karma object
            if (dbr === null) { init_ip(dbkey, cckey, expire); return next(); }

            db.multi()
                .hincrby(dbkey, 'connections', 1)  // increment total connections
                .expire(dbkey, expire)             // extend expiration date
                .incr(cckey)                       // increment concurrent connections
                .exec(function (err, replies) {
                    if (err) connection.results.add(plugin, {err: err});
                });

            var history = (dbr.good || 0) - (dbr.bad || 0);
            connection.results.add(plugin, {history: history, total_connects: dbr.connections});

            if ( plugin.check_concurrency(cckey, replies[0], history) ) {
                connection.results.add(plugin, {fail: 'max_concurrent'});
                return next();
            }

            if (dbr.penalty_start_ts === '0') {
                connection.results.add(plugin, {skip: 'penalty'});
                return next();
            }

            var ms_old = (Date.now() - Date.parse(dbr.penalty_start_ts));
            var days_old = (ms_old / 86400 / 1000).toFixed(2);
            connection.results.add(plugin, {msg: 'days_old: ' + days_old});

            var penalty_days = config.penalty.days || config.main.penalty_days || 1;
            if (days_old >= penalty_days) {
                connection.results.add(plugin, {msg: 'penalty expired'});
                return next();
            }

            var left = +(penalty_days - days_old).toFixed(2);
            connection.results.add(plugin, {fail: 'penalty', msg: 'penalty left('+left+')'});
            return next();
        });

    plugin.check_awards(connection);
};

exports.hook_connect = function (next, connection) {
    var plugin = this;
    var failures = connection.results.get('karma').fail;
    if (!failures) return next();

    var config = plugin.config.get('karma.ini');

    if (failures.indexOf('max_concurrent') !== -1) {
        if (deny_hooks.indexOf('connect') !== -1) {
            setTimeout(function () {
                return next(DENYSOFTDISCONNECT, "too many concurrent connections for you");
            }, (config.concurrency.disconnect_delay || 10) * 1000);
        }
        else {
            // so a subsequent hook will score and reject
            connection.results.incr(plugin, {connect: -10});
            return next();
        }
        return;
    }

    if (failures.indexOf('penalty') !== -1) {
        if (deny_hooks.indexOf('connect') !== -1) {
            var taunt = config.penalty.taunt || "karma penalty";
            setTimeout(function () {
                return next(DENYDISCONNECT, taunt);
            }, (config.concurrency.disconnect_delay || 10) * 1000);
        }
        else {
            connection.results.incr(plugin, {connect: -10});
            return next();
        }
        return;
    }

    return next();
};

exports.hook_helo = function (next, connection) {
    return this.should_we_deny(next, connection, 'helo');
};

exports.hook_mail = function (next, connection, params) {
    var plugin = this;

    plugin.check_spammy_tld(params[0], connection);
    plugin.check_syntax_mailfrom(connection);

    plugin.check_awards(connection);
    connection.results.add(plugin, {emit: 1});

    return plugin.should_we_deny(next, connection, 'mail');
};

exports.hook_rcpt = function (next, connection, params) {
    var plugin = this;
    var rcpt = params[0];

    // odds of being ham: < 1%
    if (rcpt.user === connection.transaction.mail_from.user) {
        connection.results.add(plugin, {fail: 'env_user_match'});
        connection.results.incr(plugin, {connect: -1});
    }

    plugin.check_syntax_RcptTo(connection);
    var too_many = plugin.max_recipients(connection);
    if (too_many) {
        connection.results.add(plugin, {fail: 'too_many_rcpt'});
        return next(DENYSOFT, too_many);
    }

    return plugin.should_we_deny(next, connection, 'rcpt');
};

exports.hook_rcpt_ok = function (next, connection, rcpt) {
    var plugin = this;

    if (rcpt.user === connection.transaction.mail_from.user) {
        connection.results.add(plugin, {fail: 'env_user_match'});
        connection.results.incr(plugin, {connect: -1});
    }

    plugin.check_syntax_RcptTo(connection);
    var too_many = plugin.max_recipients(connection);
    if (too_many) {
        connection.results.add(plugin, {fail: 'too_many_rcpt'});
        return next(DENYSOFT, too_many);
    }

    return next();
    // return next(OK);
};

exports.hook_data = function (next, connection) {
    return this.should_we_deny(next, connection, 'data');
};

exports.hook_data_post = function (next, connection) {
    // goal: prevent delivery of spam
    var plugin = this;

    var results = connection.results.collate(plugin);
    connection.loginfo("adding header: " + results);
    connection.transaction.add_header('X-Haraka-Karma', results);

    return plugin.should_we_deny(next, connection, 'data_post');
};

exports.hook_queue = function (next, connection) {
    var plugin = this;
    // last chance to prevent spam delivery, if karma runs before
    // queue plugin (config/plugins ordering)
    return plugin.should_we_deny(next, connection, 'queue');
};

exports.hook_disconnect = function (next, connection) {
    var plugin = this;
    var config = plugin.config.get('karma.ini');

    plugin.init_redis_connection();
    if (config.concurrency) db.incrby('concurrent|' + connection.remote_ip, -1);

    var asnkey;
    if (config.asn.enable && connection.results.get('connect.asn')) {
        asnkey = connection.results.get('connect.asn').asn;
        if (isNaN(asnkey)) asnkey = undefined;
    }

    var k = connection.results.get('karma');
    if (!k) {
        connection.results.add(plugin, {err: 'karma results absent!'});
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

    db.hset(key, 'penalty_start_ts', Date());
    connection.results.add(plugin, {msg: 'penalty box', emit: true });
    return next();
};

exports.get_award_location = function (connection, award_key) {
    // based on award key, find the requested note or result
    var plugin = this;
    var bits = award_key.split('@');
    var loc_bits = bits[0].split('.');
    if (loc_bits.length === 1) {          // ex: relaying
        return connection[bits[0]];
    }

    var obj;
    if (loc_bits[0] === 'notes') {        // ex: notes.spf_mail_helo
        obj = assemble_note_obj(connection, bits[0]);
        if (obj) return obj;

        // connection.loginfo(plugin, "no conn note: " + bits[0]);
        if (!connection.transaction) return;
        obj = assemble_note_obj(connection.transaction, bits[0]);
        if (obj) return obj;

        // connection.loginfo(plugin, "no txn note: " + bits[0]);
        return;
    }

    var pi_name = loc_bits[1];
    var notekey = loc_bits[2];

    if (loc_bits[0] === 'results') {   // ex: results.connect.geoip.distance
        if (phase_prefixes.indexOf(pi_name) !== -1) {
            pi_name = loc_bits[1] + '.' + loc_bits[2];
            notekey = loc_bits[3];
        }

        if (connection.transaction) {
            obj = connection.transaction.results.get(pi_name);
        }
        if (!obj) {
            // connection.logdebug(plugin, "no txn results: " + pi_name);
            obj = connection.results.get(pi_name);
        }
        if (!obj) {
            // connection.logdebug(plugin, "no conn results: " + pi_name);
            return;
        }

        // connection.logdebug(plugin, "found results for " + pi_name + ', ' + notekey);
        if (notekey) return obj[notekey];
        return obj;
    }

    if (loc_bits[0] === 'transaction' && loc_bits[1] === 'results') { // ex: transaction.results.spf
        pi_name = loc_bits[2];
        notekey = loc_bits[3];
        if (phase_prefixes.indexOf(pi_name) !== -1) {
            pi_name = loc_bits[2] + '.' + loc_bits[3];
            notekey = loc_bits[4];
        }

        if (!connection.transaction) return;
        obj = connection.transaction.results.get(pi_name);
        if (!obj) return;
        if (notekey) return obj[notekey];
        return obj;
    }

    connection.logdebug(plugin, "unknown location for " + award_key);
};

exports.get_award_condition = function (note_key, note_val) {
    var wants;
    var keybits = note_key.split('@');
    if (keybits[1]) wants = keybits[1];

    var valbits = note_val.split(/\s+/);
    if (!valbits[1]) return wants;
    if (valbits[1] !== 'if') return wants;   // no if condition

    if (valbits[2].match(/^(equals|gt|lt|match)$/)) {
        if (valbits[3]) wants = valbits[3];
    }
    return wants;
};

exports.check_awards = function (connection) {
    var plugin = this;
    var karma  = connection.results.get('karma');
    if (!karma) return;
    var todo   = karma.todo;
    if (!todo) return;

    for (var key in todo) {
        //     loc                     =     terms
        // note_location [@wants]      = award [conditions]
        // results.geoip.too_far       = -1
        // results.geoip.distance@4000 = -1 if gt 4000

        var award_terms = todo[key];

        var note = plugin.get_award_location(connection, key);
        if (note === undefined) continue;
        var wants = plugin.get_award_condition(key, award_terms);

        // test the desired condition
        var bits = award_terms.split(/\s+/);
        var award = parseFloat(bits[0]);

        if (!bits[1] || bits[1] !== 'if') {      // no if conditions
            if (!note) continue;                 // failed truth test
            if (!wants) {                        // no wants, truth matches
                plugin.apply_award(connection, key, award);
                delete todo[key];
                continue;
            }
            if (note !== wants) continue;        // didn't match
        }

        // connection.loginfo(plugin, "check_awards, case matching for: " + wants);

        // the matching logic is inverted here, weeding out non-matches
        // Matches fall through to the apply_award below.
        var condition = bits[2];
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
        plugin.apply_award(connection, key, award);
        delete todo[key];
    }
};

exports.apply_award = function (connection, nl, award) {
    var plugin = this;
    if (!award) return;
    if (isNaN(award)) {    // garbage in config
        connection.logerror(plugin, "non-numeric award from: " + nl + ':' + award);
        return;
    }

    var bits = nl.split('@'); nl = bits[0];  // strip off @... if present

    connection.results.incr(plugin, {connect: award});
    connection.loginfo(plugin, "applied " + nl + ':' + award);

    var trimmed = nl.substring(0,5) === 'notes' ? nl.substring(6) :
                  nl.substring(0,7) === 'results' ? nl.substring(8) : nl;

    if (trimmed.substring(0,7) === 'connect') trimmed = trimmed.substring(8);

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

    var count = parseFloat(val) || 0;
    count++;                 // add this connection

    var reject=0;
    if (history  <  0 && count > config.concurrency.bad) reject++;
    if (history  >  0 && count > config.concurrency.good) reject++;
    if (history === 0 && count > config.concurrency.neutral) reject++;
    if (reject) return true;
    return false;
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

    // the deeds of their past shall be considered
    var history = connection.results.get('karma').history;
    if (history >  3 && count <= cr.good) return;
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

        var award = plugin.config.get('karma.ini').asn.award;
        if (!award) return;
        if (net_score < -5) {
            connection.results.incr(plugin, {connect: (award * -1)});
            connection.results.add(plugin, {fail: 'neighbors('+net_score+')'});
            return;
        }
        if (net_score > 5) {
            connection.results.incr(plugin, {connect: award});
            connection.results.add(plugin, {pass: 'neighbors('+net_score+')'});
        }
        return;
    });
};

// Redis DB functions
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

function init_ip (dbkey, cckey, expire) {
    db.multi()
        .hmset(dbkey, {'penalty_start_ts': 0, 'bad': 0, 'good': 0, 'connections': 1})
        .expire(dbkey, expire)
        .set(cckey, 1)
        .expire(cckey, 2 * 60)        // expire after 2 min
        .exec();
}

function init_asn (asnkey, expire) {
    db.multi()
        .hmset(asnkey, {'bad': 0, 'good': 0, 'connections': 1})
        .expire(asnkey, expire * 2)    // keep ASN longer
        .exec();
}

