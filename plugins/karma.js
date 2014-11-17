'use strict';
// karma - reward good and penalize bad mail senders

var ipaddr = require('ipaddr.js');
var redis  = require('redis');
var phase_prefixes = ['connect','helo','mail_from','rcpt_to','data'];

exports.register = function () {
    var plugin = this;
    plugin.deny_hooks = ['unrecognized_command','helo','data','data_post','queue'];

    var load_config = function () {
        plugin.loginfo("loading karma.ini");
        plugin.cfg = plugin.config.get('karma.ini', {
            booleans: [
                '+asn.enable',
            ],
        }, load_config);

        if (plugin.cfg.deny && plugin.cfg.deny.hooks) {
            plugin.deny_hooks = plugin.cfg.deny.hooks.split(/[\s,;]+/);
        }
    };
    load_config();

    plugin.register_hook('init_master',  'karma_init');
    plugin.register_hook('init_child',   'karma_init');
    plugin.register_hook('connect',      'max_concurrent');
    plugin.register_hook('connect',      'karma_penalty');
};

exports.karma_init = function (next, server) {
    var plugin = this;
    plugin.init_redis_connection();
    return next();
};

exports.results_init = function (connection) {
    var plugin = this;
    if (connection.results.get('karma')) { return; } // init once per connection

    // connect: score on this connection
    // history: score of past connections (good minus bad)
    connection.results.add(plugin, {connect:0, history:0, total_connects:0});

    // todo is a list of connection/transaction notes to 'watch' for.
    // When discovered, award their karma points to the connection
    // and remove them from todo.
    if (!plugin.cfg.awards) { return; }
    var todo = {};
    for (var key in plugin.cfg.awards) {
        var award = plugin.cfg.awards[key].toString();
        todo[key] = award;
    }
    connection.results.add(plugin, {todo: todo});
};

exports.apply_tarpit = function (connection, hook, score, next) {
    var plugin = this;
    if (!plugin.cfg.tarpit) { return next(); } // tarpit disabled in config

    // If tarpit is enabled on the reset_transaction hook, Haraka doesn't
    // wait. Then bad things happen, like a Haraka crash.
    if (hook === 'reset_transaction') { return next(); }
    if (hook === 'queue') { return next(); }

    // no delay for senders with good karma
    var k = connection.results.get('karma');
    if (score === undefined) {
        score = parseFloat(k.connect);
    }
    if (score >= 0) { return next(); }

    // if (connection.relaying) { return next(); }

    // calculate how long to delay
    var delay = score * -1;
    if (parseFloat(plugin.cfg.tarpit.delay)) {
        delay = parseFloat(plugin.cfg.tarpit.delay);
        connection.logdebug(plugin, "static tarpit: " + delay);
    }

    var max = plugin.cfg.tarpit.max || 5;

    // be less punitive to roaming users
    if (([587,465].indexOf(connection.local_port) !== -1) && /^(ehlo|connect|quit)$/.test(hook)) {
        if (max > 2) { max = 2; }
        // Reduce penalty for good history
        if (k.history > 0) {
            delay = parseFloat(delay - 2);
            connection.logdebug(plugin, "tarpit reduced for good history: " + delay);
        }
        // Reduce penalty for good ASN history
        var asn = connection.results.get('connect.asn');
        if (!asn) { asn = connection.results.get('connect.geoip'); }
        if (asn && asn.asn && k.neighbors > 0) {
            delay = parseFloat(delay - 2);
            connection.logdebug(plugin, "tarpit reduced for good neighbors: " + delay);
        }
    }

    if (delay > max) {
        delay = max;
        connection.logdebug(plugin, "tarpit reduced to max: " + delay);
    }

    connection.loginfo(plugin, 'tarpitting '+hook+' for ' + delay + 's');
    setTimeout(function () {
        connection.loginfo(plugin, 'tarpit '+hook+' end');
        next();
    }, delay * 1000);
};

exports.should_we_deny = function (next, connection, hook) {
    var plugin = this;

    if (connection.early_talker) {
        return plugin.apply_tarpit(connection, hook, -10, function () {
            next(DENY, "You talk too soon");  // never seen a FP
        });
    }

    plugin.check_awards(connection);  // update awards first

    var r = connection.results.get('karma');
    if (!r) { return next(); }

    var score = parseFloat(r.connect);
    if (isNaN(score))  {
        connection.logerror(plugin, "score is NaN");
        connection.results.add(plugin, {connect:0});
        return next();
    }

    var negative_limit = -5;
    if (plugin.cfg.thresholds && plugin.cfg.thresholds.negative) {
        negative_limit = parseFloat(plugin.cfg.thresholds.negative);
    }

    if (score > negative_limit) {
        return plugin.apply_tarpit(connection, hook, score, function() { next(); });
    }
    if (plugin.deny_hooks.indexOf(hook) === -1) {
        return plugin.apply_tarpit(connection, hook, score, function() { next(); });
    }

    return plugin.apply_tarpit(connection, hook, score, function () {
        next(DENY, "very bad karma score: " + score);
    });
};

exports.hook_deny = function (next, connection, params) {
    var plugin = this;
    var pi_deny     = params[0];  // (constants.deny, denysoft, ok)
//  var pi_message  = params[1];
    var pi_name     = params[2];
//  var pi_function = params[3];
//  var pi_params   = params[4];
    var pi_hook     = params[5];

    // exceptions, whose 'DENY' should not be captured
    switch (pi_name) {
        case 'karma':        // myself
        case 'access':       // ACLs
        case 'helo.checks':  // has granular reject
        case 'data.headers': //       ""
        case 'spamassassin': //       ""
        case 'clamd':        // has clamd.excludes
            return next();
    }
    switch (pi_hook) {
        case 'rcpt_to':      // RCPT hooks are special
        case 'queue':
            return next();
    }

    if (pi_deny === DENY || pi_deny === DENYDISCONNECT || pi_deny === DISCONNECT) {
        connection.results.incr(plugin, {connect: -2});
    }
    else {
        connection.results.incr(plugin, {connect: -1});
    }

    // let temporary errors pass through
    if (pi_deny === DENYSOFT) { return next(); }

    // intercept any other denials, and let the connection continue
    connection.results.add(plugin, {fail: 'deny:' + pi_name});
    return next(OK);
};

exports.hook_connect = function (next, connection) {
    var plugin = this;
    var asnkey = plugin.get_asn_key(connection);
    if (asnkey) {
        plugin.check_asn_neighborhood(connection, asnkey);
    }
    plugin.should_we_deny(next, connection, 'connect');
};
exports.hook_helo = function (next, connection) {
    this.should_we_deny(next, connection, 'helo');
};
exports.hook_ehlo = function (next, connection) {
    this.should_we_deny(next, connection, 'ehlo');
};
exports.hook_vrfy = function (next, connection) {
    this.should_we_deny(next, connection, 'vrfy');
};
exports.hook_noop = function (next, connection) {
    this.should_we_deny(next, connection, 'noop');
};
exports.hook_data = function (next, connection) {
    this.should_we_deny(next, connection, 'data');
};
exports.hook_queue = function (next, connection) {
    this.should_we_deny(next, connection, 'queue');
};
exports.hook_reset_transaction = function (next, connection) {
    this.should_we_deny(next, connection, 'reset_transaction');
};
exports.hook_quit = function (next, connection) {
    this.should_we_deny(next, connection, 'quit');
};

exports.hook_unrecognized_command = function(next, connection, cmd) {
    var plugin = this;

    connection.results.incr(plugin, {connect: -1});
    connection.results.add(plugin, {fail: 'cmd:('+cmd+')'});

    return plugin.should_we_deny(next, connection, 'unrecognized_command');
};

exports.hook_lookup_rdns = function (next, connection) {
    var plugin = this;

    plugin.init_redis_connection();
    plugin.results_init(connection);

    var expire = (plugin.cfg.redis.expire_days || 60) * 86400; // convert to days
    var rip    = connection.remote_ip;
    var dbkey  = 'karma|' + rip;

    plugin.db.multi()
        .hget('concurrent', rip)
        .hgetall(dbkey)
        .exec(function redisResults (err, replies) {
            if (err) {
                connection.results.add(plugin, {err: err});
                return next();
            }

            var dbr = replies[1];   // 2nd pos. of multi reply is karma object
            if (dbr === null) {
                plugin.init_ip(dbkey, rip, expire);
                return next();
            }

            plugin.db.multi()
                .hincrby(dbkey, 'connections', 1)  // increment total connections
                .expire(dbkey, expire)             // extend expiration date
                .hincrby('concurrent', rip, 1)     // increment concurrent connections
                .exec(function (err, replies) {
                    if (err) connection.results.add(plugin, {err: err});
                });

            var history = (dbr.good || 0) - (dbr.bad || 0);
            connection.results.add(plugin, {history: history, total_connects: dbr.connections});

            if (plugin.check_concurrency(replies[0], history)) {
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

            var penalty_days = plugin.cfg.penalty.days || plugin.cfg.main.penalty_days || 1;
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

exports.max_concurrent = function (next, connection) {
    var plugin = this;
    var r = connection.results.get('karma');
    if (!r || !r.fail) { return next(); }
    if ( r.fail.indexOf('max_concurrent') === -1) { return next(); }

    var delay = 5;
    if (plugin.cfg.concurrency && plugin.cfg.concurrency.disconnect_delay) {
        delay = parseFloat(plugin.cfg.concurrency.disconnect_delay);
    }

    // Disconnect slowly.
    setTimeout(function () {
        return next(DENYSOFTDISCONNECT, "too many concurrent connections for you");
    }, delay * 1000);
};

exports.karma_penalty = function (next, connection) {
    var plugin = this;
    var r = connection.results.get('karma');
    if (!r || !r.fail) { return next(); }
    if (r.fail.indexOf('penalty') === -1) { return next(); }

    var taunt = plugin.cfg.penalty.taunt || "karma penalty";
    var delay = 10;
    if (plugin.cfg.penalty && plugin.cfg.penalty.disconnect_delay) {
        delay = parseFloat(plugin.cfg.penalty.disconnect_delay);
    }

    setTimeout(function () {
        return next(DENYDISCONNECT, taunt);
    }, delay * 1000);
};

exports.hook_mail = function (next, connection, params) {
    var plugin = this;

    plugin.check_spammy_tld(params[0], connection);

    // look for an illegal (RFC 5321,(2)821) space in envelope from
    var full_from = connection.current_line;
    if (full_from.toUpperCase().substring(0,11) !== 'MAIL FROM:<') {
        connection.loginfo(plugin, "RFC ignorant env addr format: " + full_from );
        connection.results.add(plugin, {fail: 'rfc5321.MailFrom'});
    }

    plugin.check_awards(connection);
    connection.results.add(plugin, {emit: 1});

    return plugin.should_we_deny(next, connection, 'mail');
};

exports.hook_rcpt = function (next, connection, params) {
    var plugin = this;
    var rcpt = params[0];

    // odds of from_user=rcpt_user in ham: < 1%, in spam > 40%
    var txn = connection.transaction;
    if (txn && txn.mail_from && txn.mail_from.user === rcpt.user) {
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

    var txn = connection.transaction;
    if (txn && txn.mail_from && txn.mail_from.user === rcpt.user) {
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

exports.hook_data_post = function (next, connection) {
    // goal: prevent delivery of spam
    var plugin = this;

    plugin.check_awards(connection);  // update awards

    var results = connection.results.collate(plugin);
    connection.loginfo(plugin, "adding header: " + results);
    connection.transaction.add_header('X-Haraka-Karma', results);

    return plugin.should_we_deny(next, connection, 'data_post');
};

exports.hook_disconnect = function (next, connection) {
    var plugin = this;

    plugin.init_redis_connection();
    if (plugin.cfg.concurrency) {
        plugin.db.hincrby('concurrent', connection.remote_ip, -1);
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

    if (!plugin.cfg.thresholds) {
        plugin.check_awards(connection);
        connection.results.add(plugin, {msg: 'no action', emit: true });
        return next();
    }

    var pos_lim = plugin.cfg.thresholds.positive || 3;
    var asnkey = plugin.get_asn_key(connection);
    if (k.connect > pos_lim) {
        plugin.db.hincrby(key, 'good', 1);
        if (asnkey) plugin.db.hincrby(asnkey, 'good', 1);
        connection.results.add(plugin, {msg: 'positive', emit: true });
        return next();
    }

    if (k.connect >= 0) {
        connection.results.add(plugin, {msg: 'neutral', emit: true });
        return next();
    }

    plugin.db.hincrby(key, 'bad', 1);
    if (asnkey) plugin.db.hincrby(asnkey, 'bad', 1);
    k.history--;

    if (k.history > plugin.cfg.thresholds.history_negative) {
        connection.results.add(plugin, {msg: 'good enough hist', emit: true });
        return next();
    }

    if (k.total_connects < 5) {
        connection.results.add(plugin, {msg: 'not enough hist', emit: true });
        return next();
    }

    var punish_limit = plugin.cfg.thresholds.punish || -10;
    if (k.connect > punish_limit) { return next(); }

    plugin.db.hset(key, 'penalty_start_ts', Date());
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
        obj = plugin.assemble_note_obj(connection, bits[0]);
        if (obj) { return obj; }

        // connection.loginfo(plugin, "no conn note: " + bits[0]);
        if (!connection.transaction) { return; }
        obj = plugin.assemble_note_obj(connection.transaction, bits[0]);
        if (obj) { return obj; }

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
        if (notekey) { return obj[notekey]; }
        return obj;
    }

    if (loc_bits[0] === 'transaction' && loc_bits[1] === 'results') { // ex: transaction.results.spf
        pi_name = loc_bits[2];
        notekey = loc_bits[3];
        if (phase_prefixes.indexOf(pi_name) !== -1) {
            pi_name = loc_bits[2] + '.' + loc_bits[3];
            notekey = loc_bits[4];
        }

        if (!connection.transaction) { return; }
        obj = connection.transaction.results.get(pi_name);
        if (!obj) { return; }
        if (notekey) { return obj[notekey]; }
        return obj;
    }

    connection.logdebug(plugin, "unknown location for " + award_key);
};

exports.get_award_condition = function (note_key, note_val) {
    var wants;
    var keybits = note_key.split('@');
    if (keybits[1]) { wants = keybits[1]; }

    var valbits = note_val.split(/\s+/);
    if (!valbits[1]) { return wants; }
    if (valbits[1] !== 'if') { return wants; }  // no if condition

    if (valbits[2].match(/^(equals|gt|lt|match)$/)) {
        if (valbits[3]) { wants = valbits[3]; }
    }
    return wants;
};

exports.check_awards = function (connection) {
    var plugin = this;
    var karma  = connection.results.get('karma');
    if (!karma) { return; }
    var todo   = karma.todo;
    if (!todo) { return; }

    for (var key in todo) {
        //     loc                     =     terms
        // note_location [@wants]      = award [conditions]
        // results.geoip.too_far       = -1
        // results.geoip.distance@4000 = -1 if gt 4000
        var award_terms = todo[key];

        var note = plugin.get_award_location(connection, key);
        if (note === undefined) { continue; }
        var wants = plugin.get_award_condition(key, award_terms);

        // test the desired condition
        var bits = award_terms.split(/\s+/);
        var award = parseFloat(bits[0]);
        if (!bits[1] || bits[1] !== 'if') {      // no if conditions
            if (!note) { continue; }             // failed truth test
            if (!wants) {                        // no wants, truth matches
                plugin.apply_award(connection, key, award);
                delete todo[key];
                continue;
            }
            if (note !== wants) { continue; }    // didn't match
        }

        // connection.loginfo(plugin, "check_awards, case matching for: " + wants);

        // the matching logic here is inverted, weeding out misses (continue)
        // Matches fall through (break) to the apply_award below.
        var condition = bits[2];
        switch (condition) {
            case 'equals':
                if (wants != note) { continue; }
                break;
            case 'gt':
                if (parseFloat(note) <= parseFloat(wants)) { continue; }
                break;
            case 'lt':
                if (parseFloat(note) >= parseFloat(wants)) { continue; }
                break;
            case 'match':
                if (Array.isArray(note)) {
                    // connection.logerror(plugin, "matching an array");
                    if (new RegExp(wants, 'i').test(note)) { break; }
                }
                if (note.toString().match(new RegExp(wants, 'i'))) { break; }
                continue;
            case 'length':
                var operator = bits[3];
                if (bits[4]) { wants = bits[4]; }
                switch (operator) {
                    case 'gt':
                        if (note.length <= parseFloat(wants)) { continue; }
                        break;
                    case 'lt':
                        if (note.length >= parseFloat(wants)) { continue; }
                        break;
                    case 'equals':
                        if (note.length !== parseFloat(wants)) { continue; }
                        break;
                    default:
                        connection.logerror(plugin, 'length operator "' + operator + '" not supported.');
                        continue;   // not supported!
                }
                break;
            case 'in':              // if in pass whitelisted
                var list = bits[3];
                if (bits[4]) { wants = bits[4]; }
                if (!Array.isArray(note)) { continue; }
                if (!wants) { continue; }
                if (note.indexOf(wants) !== -1) { break; } // found!
                continue;
            default:
                continue;
        }
        plugin.apply_award(connection, key, award);
        delete todo[key];
    }
};

exports.apply_award = function (connection, nl, award) {
    var plugin = this;
    if (!award) { return; }
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

exports.check_concurrency = function (val, history) {
    var plugin = this;
    if (!plugin.cfg.concurrency) { return; }

    var count = parseFloat(val) || 0;
    count++;                 // add this connection

    var reject=0;
    if (history  <  0 && count > (plugin.cfg.concurrency.bad || 2)) reject++;
    if (history === 0 && count > (plugin.cfg.concurrency.neutral || 3)) reject++;
    if (history  >  0 && count > (plugin.cfg.concurrency.good || 9)) reject++;
    if (reject) { return true; }
    return false;
};

exports.max_recipients = function (connection) {
    var plugin = this;
    if (connection.relaying) { return; }
    if (!plugin.cfg.recipients) { return; }    // disabled in config

    var c = connection.rcpt_count;
    var count = c.accept + c.tempfail + c.reject + 1;
    if (count < 2) { return; }         // everybody is allowed one

    connection.logdebug(plugin, "recipient count: " + count );

    var desc = history > 3 ? 'good' : history >= 0 ? 'neutral' : 'bad';

    // the deeds of their past shall be considered
    var history = connection.results.get('karma').history;
    if (history >  3 && count <= plugin.cfg.recipients.good) { return; }
    if (history > -1 && count <= plugin.cfg.recipients.neutral) { return; }

    // this is *more* strict than history, b/c they have fewer opportunities
    // to score positive karma this early in the connection. senders with
    // good history will rarely see these limits.
    var score = connection.results.get('karma').connect;
    if (score >  3 && count <= plugin.cfg.recipients.good) { return; }
    if (score >= 0 && count <= plugin.cfg.recipients.neutral) { return; }
    if (count <= plugin.cfg.recipients.bad) { return; }

    return 'too many recipients (' + count + ') for ' + desc + ' karma';
};

exports.check_spammy_tld = function (mail_from, connection) {
    var plugin = this;
    if (!plugin.cfg.spammy_tlds) { return; }
    if (mail_from.isNull()) { return; }         // null sender (bounce)

    var from_tld = mail_from.host.split('.').pop();
    // connection.logdebug(plugin, "from_tld: " + from_tld);

    var tld_penalty = parseFloat(plugin.cfg.spammy_tlds[from_tld] || 0);
    if (tld_penalty === 0) { return; }

    connection.results.incr(plugin, {connect: tld_penalty});
    connection.results.add(plugin, {fail: 'spammy.TLD', emit: true});
};

exports.check_syntax_RcptTo = function (connection) {
    var plugin = this;

    // look for an illegal (RFC 5321,(2)821) space in envelope recipient
    var full_rcpt = connection.current_line;
    if (full_rcpt.toUpperCase().substring(0,9) === 'RCPT TO:<') { return; }

    connection.loginfo(plugin, "illegal envelope address format: " + full_rcpt );
    connection.results.add(plugin, {fail: 'rfc5321.RcptTo'});
};

exports.assemble_note_obj = function(prefix, key) {
    var note = prefix;
    var parts = key.split('.');
    while (parts.length > 0) {
        var next = parts.shift();
        if (phase_prefixes.indexOf(next) !== -1) {
            next = next + '.' + parts.shift();
        }
        note = note[next];
        if (note === null || note === undefined) { break; }
    }
    return note;
};

exports.check_asn_neighborhood = function (connection, asnkey) {
    var plugin = this;
    plugin.db.hgetall(asnkey, function (err, res) {
        if (err) {
            connection.results.add(plugin, {err: err});
            return;
        }

        if (res === null) {
            var expire = (plugin.cfg.redis.expire_days || 60) * 86400; // convert to days
            plugin.init_asn(asnkey, expire);
            return;
        }

        plugin.db.hincrby(asnkey, 'connections', 1);
        var net_score = parseFloat(res.good || 0) - (res.bad || 0);
        if (!net_score) { return; }

        if (net_score < -5) {
            connection.results.add(plugin, {fail: 'neighbors('+net_score+')'});
        }
        if (net_score > 5) {
            connection.results.add(plugin, {pass: 'neighbors'});
        }
        connection.results.add(plugin, {neighbors: net_score, emit: true});
    });
};

// Redis DB functions
exports.init_redis_connection = function () {
    var plugin = this;
    // this is called during init, lookup_rdns, and disconnect
    if (plugin.db && plugin.db.ping()) { return; } // connection is good

    var redis_ip  = '127.0.0.1';
    var redis_port = '6379';
    if (plugin.cfg.redis) {
        redis_ip = plugin.cfg.redis.server_ip || '127.0.0.1';
        redis_port = plugin.cfg.redis.server_port || '6379';
    }

    plugin.db = redis.createClient(redis_port, redis_ip);
    plugin.db.on('error', function (error) {
        plugin.logerror(plugin, 'Redis error: ' + error.message);
        plugin.db = null;
    });

    var reset = parseFloat(plugin.cfg.concurrency.reset) || 10;
    plugin.loginfo('clearing concurrency every ' + reset + ' minutes');
    plugin._interval = setInterval(function () {
        plugin.loginfo('clearing concurrency');
        plugin.db.del('concurrent');
    }, (reset * 60) * 1000);
};

exports.init_ip = function (dbkey, rip, expire) {
    var plugin = this;
    plugin.db.multi()
        .hmset(dbkey, {'penalty_start_ts': 0, 'bad': 0, 'good': 0, 'connections': 1})
        .expire(dbkey, expire)
        .hset('concurrent', rip, 1)
        .exec();
};

exports.get_asn_key = function (connection) {
    var plugin = this;
    if (!plugin.cfg.asn.enable) { return; }
    var asn = connection.results.get('connect.asn');
    if (!asn || !asn.asn) {
        asn = connection.results.get('connect.geoip');
    }
    if (!asn || !asn.asn || isNaN(asn.asn)) { return; }
    return 'as' + asn.asn;
};

exports.init_asn = function (asnkey, expire) {
    var plugin = this;
    plugin.db.multi()
        .hmset(asnkey, {'bad': 0, 'good': 0, 'connections': 1})
        .expire(asnkey, expire * 2)    // keep ASN longer
        .exec();
};
