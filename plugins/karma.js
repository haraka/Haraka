'use strict';
// karma - reward good and penalize bad mail senders

var utils  = require('./utils');

var phase_prefixes = utils.to_object(
        ['connect','helo','mail_from','rcpt_to','data']
        );

exports.register = function () {
    var plugin = this;
    plugin.inherits('redis');

    // set up defaults
    plugin.deny_hooks = utils.to_object(
            ['unrecognized_command','helo','data','data_post','queue']
        );
    plugin.deny_exclude_hooks = utils.to_object('rcpt_to, queue');
    plugin.deny_exclude_plugins = utils.to_object(
            ['access', 'helo.checks', 'data.headers', 'spamassassin',
            'mail_from.is_resolvable', 'clamd', 'tls']
    );

    plugin.load_karma_ini();
    plugin.load_redis_ini();

    plugin.register_hook('init_master',  'init_redis_plugin');
    plugin.register_hook('init_child',   'init_redis_plugin');

    plugin.register_hook('connect_init', 'results_init');
    plugin.register_hook('connect_init', 'history_from_redis');
};

exports.load_karma_ini = function () {
    var plugin = this;

    plugin.cfg = plugin.config.get('karma.ini', {
        booleans: [
            '+asn.enable',
        ],
    }, function () {
        plugin.load_karma_ini();
    });

    var cfg = plugin.cfg;
    if (cfg.deny && cfg.deny.hooks) {
        plugin.deny_hooks = utils.to_object(cfg.deny.hooks);
    }

    var e = cfg.deny_excludes;
    if (e && e.hooks) {
        plugin.deny_exclude_hooks = utils.to_object(e.hooks);
    }

    if (e && e.plugins) {
        plugin.deny_exclude_plugins = utils.to_object(e.plugins);
    }

    if (cfg.result_awards) {
        plugin.preparse_result_awards();
    }

    if (!cfg.redis) cfg.redis = {};
    if (!cfg.redis.host && cfg.redis.server_ip) {
        cfg.redis.host = cfg.redis.server_ip; // backwards compat
    }
    if (!cfg.redis.port && cfg.redis.server_port) {
        cfg.redis.port = cfg.redis.server_port; // backwards compat
    }
    if (!cfg.redis.host) cfg.redis.host = '127.0.0.1';
    if (!cfg.redis.port) cfg.redis.port = 6379;
};

exports.results_init = function (next, connection) {
    var plugin = this;

    if (connection.results.get('karma')) {
        connection.logerror(plugin, 'this should never happen');
        return next();    // init once per connection
    }

    if (plugin.cfg.awards) {
        // todo is a list of connection/transaction awards to 'watch' for.
        // When discovered, apply the awards value
        var todo = {};
        for (var key in plugin.cfg.awards) {
            var award = plugin.cfg.awards[key].toString();
            todo[key] = award;
        }
    }
    connection.results.add(plugin, { score:0, todo: todo });

    if (!connection.server.notes.redis) return next();
    if (!plugin.result_awards) return next();  // not configured

    // subscribe to result_store publish messages
    plugin.redis_subscribe(connection, function () {
        connection.notes.redis.on('pmessage', function (pattern, channel, message) {
            plugin.check_result(connection, message);
        });
        next();
    });
};

exports.preparse_result_awards = function () {
    var plugin = this;
    if (!plugin.result_awards) plugin.result_awards = {};

    // arrange results for rapid traversal by check_result() :
    // ex: karma.result_awards.clamd.fail = { .... }
    Object.keys(plugin.cfg.result_awards).forEach(function(anum) {
        // plugin, property, operator, value, award, reason, resolution
        var parts = plugin.cfg.result_awards[anum].split(/(?:\s*\|\s*)/);
        var pi_name = parts[0];
        var property = parts[1];
        if (!plugin.result_awards[pi_name]) {
            plugin.result_awards[pi_name] = {};
        }
        if (!plugin.result_awards[pi_name][property]) {
            plugin.result_awards[pi_name][property] = [];
        }
        plugin.result_awards[pi_name][property].push(
                {   id         : anum,
                    operator   : parts[2],
                    value      : parts[3],
                    award      : parts[4],
                    reason     : parts[5],
                    resolution : parts[6],
                });
    });
};

exports.check_result = function (connection, message) {
    var plugin = this;
    // connection.loginfo(plugin, message);
    // {"plugin":"karma","result":{"fail":"spamassassin.hits"}}
    // {"plugin":"connect.geoip","result":{"country":"CN"}}

    var m = JSON.parse(message);
    if (m && m.result && m.result.asn) {
        plugin.check_result_asn(m.result.asn, connection);
    }
    if (!plugin.result_awards[m.plugin]) return;  // no awards for plugin

    Object.keys(m.result).forEach(function (r) {  // foreach result in mess
        if (r === 'emit') return;  // r: pass, fail, skip, err, ...

        var pi_prop = plugin.result_awards[m.plugin][r];
        if (!pi_prop) return;      // no award for this plugin property

        var thisResult = m.result[r];
        // ignore empty arrays, objects, and strings
        if (Array.isArray(thisResult) && thisResult.length === 0) return;
        if (typeof thisResult === 'object' && !Object.keys(thisResult).length) {
            return;
        }
        if (typeof thisResult === 'string' && !thisResult) return; // empty

        // do any award conditions match this result?
        for (var i=0; i < pi_prop.length; i++) {     // each award...
            var thisAward = pi_prop[i];
            // { id: '011', operator: 'equals', value: 'all_bad', award: '-2'}
            var thisResArr = plugin.result_as_array(thisResult);
            switch (thisAward.operator) {
                case 'equals':
                    plugin.check_result_equal(thisResArr, thisAward, connection);
                    break;
                case 'match':
                    plugin.check_result_match(thisResArr, thisAward, connection);
                    break;
                case 'lt':
                    plugin.check_result_lt(thisResArr, thisAward, connection);
                    break;
                case 'gt':
                    plugin.check_result_gt(thisResArr, thisAward, connection);
                    break;
            }
        }
    });
};

exports.result_as_array = function (result) {

    if (typeof result === 'string') return [result];
    if (typeof result === 'number') return [result];
    if (typeof result === 'boolean') return [result];
    if (Array.isArray(result)) return result;
    if (typeof result === 'object') {
        var array = [];
        Object.keys(result).forEach(function (tr) {
            array.push(result[tr]);
        });
        return array;
    }
    this.loginfo('what format is result: ' + result);
    return result;
};

exports.check_result_asn = function (asn, conn) {
    var plugin = this;
    if (!plugin.cfg.asn_awards) return;
    if (!plugin.cfg.asn_awards[asn]) return;

    conn.results.incr(plugin, {score: plugin.cfg.asn_awards[asn]});
    conn.results.push(plugin, {fail: 'asn_awards'});
};

exports.check_result_lt = function (thisResult, thisAward, conn) {
    var plugin = this;

    for (var j=0; j < thisResult.length; j++) {
        var tr = parseFloat(thisResult[j]);
        if (tr >= parseFloat(thisAward.value)) continue;
        if (conn.results.has('karma', 'awards', thisAward.id)) continue;

        conn.results.incr(plugin, {score: thisAward.award});
        conn.results.push(plugin, {awards: thisAward.id});
    }
};

exports.check_result_gt = function (thisResult, thisAward, conn) {
    var plugin = this;

    for (var j=0; j < thisResult.length; j++) {
        var tr = parseFloat(thisResult[j]);
        if (tr <= parseFloat(thisAward.value)) continue;
        if (conn.results.has('karma', 'awards', thisAward.id)) continue;

        conn.results.incr(plugin, {score: thisAward.award});
        conn.results.push(plugin, {awards: thisAward.id});
    }
};

exports.check_result_equal = function (thisResult, thisAward, conn) {
    var plugin = this;

    /* jshint eqeqeq: false */
    for (var j=0; j < thisResult.length; j++) {
        if (thisAward.value === 'true') {
            if (!thisResult[j]) continue;
        }
        else {
            if (thisResult[j] != thisAward.value) continue;
        }
        if (!/auth/.test(thisAward.plugin)) {
            // only auth attempts are scored > 1x
            if (conn.results.has('karma', 'awards', thisAward.id)) continue;
        }

        conn.results.incr(plugin, {score: thisAward.award});
        conn.results.push(plugin, {awards: thisAward.id});
    }
};

exports.check_result_match = function (thisResult, thisAward, conn) {
    var plugin = this;
    var re = new RegExp(thisAward.value, 'i');

    for (var i=0; i < thisResult.length; i++) {
        if (!re.test(thisResult[i])) continue;
        if (conn.results.has('karma', 'awards', thisAward.id)) continue;

        conn.results.incr(plugin, {score: thisAward.award});
        conn.results.push(plugin, {awards: thisAward.id});
    }
};

exports.apply_tarpit = function (connection, hook, score, next) {
    var plugin = this;
    if (!plugin.cfg.tarpit) { return next(); } // tarpit disabled in config

    // If tarpit is enabled on the reset_transaction hook, Haraka doesn't
    // wait. Then bad things happen, like a Haraka crash.
    if (utils.in_array(hook, ['reset_transaction','queue'])) return next();

    // no delay for senders with good karma
    var k = connection.results.get('karma');
    if (score === undefined) { score = parseFloat(k.score); }
    if (score >= 0) { return next(); }

    // how long to delay?
    var delay = plugin.tarpit_delay(score, connection, hook, k);
    if (!delay) return next();

    connection.logdebug(plugin, 'tarpitting '+hook+' for ' + delay + 's');
    setTimeout(function () {
        connection.logdebug(plugin, 'tarpit '+hook+' end');
        next();
    }, delay * 1000);
};

exports.tarpit_delay = function (score, connection, hook, k) {
    var plugin = this;

    if (plugin.cfg.tarpit.delay && parseFloat(plugin.cfg.tarpit.delay)) {
        connection.logdebug(plugin, 'static tarpit');
        return parseFloat(plugin.cfg.tarpit.delay);
    }

    var delay = score * -1;   // progressive tarpit

    // detect roaming users based on MSA ports that require auth
    if (utils.in_array(connection.local.port, [587,465]) &&
        utils.in_array(hook, ['ehlo','connect'])) {
        return plugin.tarpit_delay_msa(connection, delay, k);
    }

    var max = plugin.cfg.tarpit.max || 5;
    if (delay > max) {
        connection.logdebug(plugin, 'tarpit capped to: ' + max);
        return max;
    }

    return delay;
};

exports.tarpit_delay_msa = function (connection, delay, k) {
    var plugin = this;
    var trg = 'tarpit reduced for good';

    delay = parseFloat(delay);

    // Reduce delay for good history
    var history = ((k.good || 0) - (k.bad || 0));
    if (history > 0) {
        delay = delay - 2;
        connection.logdebug(plugin, trg + ' history: ' + delay);
    }

    // Reduce delay for good ASN history
    var asn = connection.results.get('connect.asn');
    if (!asn) { asn = connection.results.get('connect.geoip'); }
    if (asn && asn.asn && k.neighbors > 0) {
        connection.logdebug(plugin, trg + ' neighbors: ' + delay);
        delay = delay - 2;
    }

    var max = plugin.cfg.tarpit.max_msa || 2;
    if (delay > max) {
        connection.logdebug(plugin, 'tarpit capped at: ' + delay);
        delay = max;
    }

    return delay;
};

exports.should_we_deny = function (next, connection, hook) {
    var plugin = this;

    var r = connection.results.get('karma');
    if (!r) { return next(); }

    plugin.check_awards(connection);  // update awards first

    var score = parseFloat(r.score);
    if (isNaN(score))  {
        connection.logerror(plugin, 'score is NaN');
        connection.results.add(plugin, {score: 0});
        return next();
    }

    var negative_limit = -5;
    if (plugin.cfg.thresholds && plugin.cfg.thresholds.negative) {
        negative_limit = parseFloat(plugin.cfg.thresholds.negative);
    }

    if (score > negative_limit) {
        return plugin.apply_tarpit(connection, hook, score, next);
    }
    if (!plugin.deny_hooks[hook]) {
        return plugin.apply_tarpit(connection, hook, score, next);
    }

    var rejectMsg = 'very bad karma score: {score}';
    if (plugin.cfg.deny && plugin.cfg.deny.message) {
        rejectMsg = plugin.cfg.deny.message;
    }

    if (/\{/.test(rejectMsg)) {
        rejectMsg = rejectMsg.replace(/\{score\}/, score);
        rejectMsg = rejectMsg.replace(/\{uuid\}/, connection.uuid);
    }

    return plugin.apply_tarpit(connection, hook, score, function () {
        next(DENY, rejectMsg);
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
    if (pi_name) {
        if (pi_name === 'karma') return next();
        if (plugin.deny_exclude_plugins[pi_name]) return next();
    }
    if (pi_hook && plugin.deny_exclude_hooks[pi_hook]) {
        return next();
    }

    // let temporary errors pass through
    if (pi_deny === DENYSOFT || pi_deny === DENYSOFTDISCONNECT) {
        return next();
    }

    if (connection.results) {
        // intercept any other denials
        connection.results.add(plugin, {fail: 'deny:' + pi_name});

        if (pi_deny === DENY ||
            pi_deny === DENYDISCONNECT ||
            pi_deny === DISCONNECT) {
            connection.results.incr(plugin, {score: -2});
        }
        else {
            connection.results.incr(plugin, {score: -1});
        }
    }

    // let the connection continue
    return next(OK);
};

exports.hook_connect = function (next, connection) {
    var plugin = this;
    var asnkey = plugin.get_asn_key(connection);
    if (asnkey) {
        plugin.check_asn(connection, asnkey);
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
    var plugin = this;
    connection.results.add(plugin, {emit: true});
    plugin.should_we_deny(next, connection, 'reset_transaction');
};

exports.hook_unrecognized_command = function(next, connection, cmd) {
    var plugin = this;

    connection.results.incr(plugin, {score: -1});
    connection.results.add(plugin, {fail: 'cmd:('+cmd+')'});

    return plugin.should_we_deny(next, connection, 'unrecognized_command');
};

exports.history_from_redis = function (next, connection) {
    var plugin = this;

    var expire = (plugin.cfg.redis.expire_days || 60) * 86400; // to days
    var dbkey  = 'karma|' + connection.remote.ip;

    plugin.db.hgetall(dbkey, function (err, dbr) {
        if (err) {
            connection.results.add(plugin, {err: err});
            return next();
        }

        if (dbr === null) {
            plugin.init_ip(dbkey, connection.remote.ip, expire);
            return next();
        }

        plugin.db.multi()
            .hincrby(dbkey, 'connections', 1)  // increment total conn
            .expire(dbkey, expire)             // extend expiration
            .exec(function (err2, replies) {
                if (err2) connection.results.add(plugin, {err: err2});
            });

        // Careful: don't become self-fulfilling prophecy.
        if (parseInt(dbr.good) > 5 && parseInt(dbr.bad) === 0) {
            connection.results.add(plugin, {pass: 'all_good'});
        }
        if (parseInt(dbr.bad) > 5 && parseInt(dbr.good) === 0) {
            connection.results.add(plugin, {fail: 'all_bad'});
        }

        connection.results.add(plugin, {
            good: dbr.good,
            bad: dbr.bad,
            connections: dbr.connections,
            history: parseInt((dbr.good || 0) - (dbr.bad || 0)),
            emit: true,
        });

        plugin.check_awards(connection);
        return next();
    });
};

exports.hook_mail = function (next, connection, params) {
    var plugin = this;

    plugin.check_spammy_tld(params[0], connection);

    // look for invalid (RFC 5321,(2)821) space in envelope from
    var full_from = connection.current_line;
    if (full_from.toUpperCase().substring(0,11) !== 'MAIL FROM:<') {
        connection.loginfo(plugin,
                'RFC ignorant env addr format: ' + full_from);
        connection.results.add(plugin, {fail: 'rfc5321.MailFrom'});
    }

    return plugin.should_we_deny(next, connection, 'mail');
};

exports.hook_rcpt = function (next, connection, params) {
    var plugin = this;
    var rcpt = params[0];

    // hook_rcpt    catches recipients that no rcpt_to plugin permitted
    // hook_rcpt_ok catches accepted recipients

    // odds of from_user=rcpt_user in ham: < 1%, in spam > 40%
    // 2015-05 30-day sample: 84% spam correlation
    var txn = connection.transaction;
    if (txn && txn.mail_from && txn.mail_from.user === rcpt.user) {
        connection.results.add(plugin, {fail: 'env_user_match'});
    }

    plugin.check_syntax_RcptTo(connection);

    connection.results.add(plugin, {fail: 'rcpt_to'});

    return plugin.should_we_deny(next, connection, 'rcpt');
};

exports.hook_rcpt_ok = function (next, connection, rcpt) {
    var plugin = this;

    var txn = connection.transaction;
    if (txn && txn.mail_from && txn.mail_from.user === rcpt.user) {
        connection.results.add(plugin, {fail: 'env_user_match'});
    }

    plugin.check_syntax_RcptTo(connection);

    return plugin.should_we_deny(next, connection, 'rcpt');
};

exports.hook_data_post = function (next, connection) {
    // goal: prevent delivery of spam before queue
    var plugin = this;

    plugin.check_awards(connection);  // update awards

    var results = connection.results.collate(plugin);
    connection.logdebug(plugin, 'adding header: ' + results);
    connection.transaction.add_header('X-Haraka-Karma', results);

    return plugin.should_we_deny(next, connection, 'data_post');
};

exports.increment = function (connection, key, val) {
    var plugin = this;

    plugin.db.hincrby('karma|' + connection.remote.ip, key, 1);

    var asnkey = plugin.get_asn_key(connection);
    if (asnkey) plugin.db.hincrby(asnkey, key, 1);
};

exports.hook_disconnect = function (next, connection) {
    var plugin = this;

    plugin.redis_unsubscribe(connection);

    var k = connection.results.get('karma');
    if (!k || k.score === undefined) {
        connection.results.add(plugin, {err: 'karma results missing'});
        return next();
    }

    if (!plugin.cfg.thresholds) {
        plugin.check_awards(connection);
        connection.results.add(plugin, {msg: 'no action', emit: true });
        return next();
    }

    if (k.score > (plugin.cfg.thresholds.positive || 3)) {
        plugin.increment(connection, 'good', 1);
    }
    if (k.score < 0) {
        plugin.increment(connection, 'bad', 1);
    }

    connection.results.add(plugin, {emit: true });
    return next();
};

exports.get_award_loc_from_note = function (connection, award) {
    var plugin = this;

    if (connection.transaction) {
        var obj = plugin.assemble_note_obj(connection.transaction, award);
        if (obj) { return obj; }
    }

    // connection.logdebug(plugin, 'no txn note: ' + award);
    obj = plugin.assemble_note_obj(connection, award);
    if (obj) { return obj; }

    // connection.logdebug(plugin, 'no conn note: ' + award);
    return;
};

exports.get_award_loc_from_results = function (connection, loc_bits) {

    var pi_name = loc_bits[1];
    var notekey = loc_bits[2];

    if (phase_prefixes[pi_name]) {
        pi_name = loc_bits[1] + '.' + loc_bits[2];
        notekey = loc_bits[3];
    }

    if (connection.transaction) {
        var obj = connection.transaction.results.get(pi_name);
    }
    if (!obj) {
        // connection.logdebug(plugin, 'no txn results: ' + pi_name);
        obj = connection.results.get(pi_name);
    }
    if (!obj) {
        // connection.logdebug(plugin, 'no conn results: ' + pi_name);
        return;
    }

    // connection.logdebug(plugin, 'found results for ' + pi_name +
    //     ', ' + notekey);
    if (notekey) { return obj[notekey]; }
    return obj;
};

exports.get_award_location = function (connection, award_key) {
    // based on award key, find the requested note or result
    var plugin = this;
    var bits = award_key.split('@');
    var loc_bits = bits[0].split('.');
    if (loc_bits.length === 1) {          // ex: relaying
        return connection[bits[0]];
    }

    if (loc_bits[0] === 'notes') {        // ex: notes.spf_mail_helo
        return plugin.get_award_loc_from_note(connection, bits[0]);
    }

    if (loc_bits[0] === 'results') {   // ex: results.connect.geoip.distance
        return plugin.get_award_loc_from_results(connection, loc_bits);
    }

    // ex: transaction.results.spf
    if (connection.transaction &&
        loc_bits[0] === 'transaction' &&
        loc_bits[1] === 'results') {
        loc_bits.shift();
        return plugin.get_award_loc_from_results(
            connection.transaction, loc_bits);
    }

    connection.logdebug(plugin, 'unknown location for ' + award_key);
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
    /* jshint maxstatements: 50 */
    var plugin = this;
    var karma  = connection.results.get('karma');
    if (!karma     ) return;
    if (!karma.todo) return;

    for (var key in karma.todo) {
        //     loc                     =     terms
        // note_location [@wants]      = award [conditions]
        // results.geoip.too_far       = -1
        // results.geoip.distance@4000 = -1 if gt 4000
        var award_terms = karma.todo[key];

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
                delete karma.todo[key];
                continue;
            }
            if (note !== wants) { continue; }    // didn't match
        }

        // connection.loginfo(plugin, 'check_awards, case matching for: ' +
        //    wants);

        // the matching logic here is inverted, weeding out misses (continue)
        // Matches fall through (break) to the apply_award below.
        var condition = bits[2];
        switch (condition) {
            case 'equals':
                /* jshint eqeqeq: false */
                if (wants != note) continue;
                break;
            case 'gt':
                if (parseFloat(note) <= parseFloat(wants)) { continue; }
                break;
            case 'lt':
                if (parseFloat(note) >= parseFloat(wants)) { continue; }
                break;
            case 'match':
                if (Array.isArray(note)) {
                    // connection.logerror(plugin, 'matching an array');
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
                        connection.logerror(plugin, 'length operator "' +
                                operator + '" not supported.');
                        continue;   // not supported!
                }
                break;
            case 'in':              // if in pass whitelisted
                // var list = bits[3];
                if (bits[4]) { wants = bits[4]; }
                if (!Array.isArray(note)) { continue; }
                if (!wants) { continue; }
                if (note.indexOf(wants) !== -1) { break; } // found!
                continue;
            default:
                continue;
        }
        plugin.apply_award(connection, key, award);
        delete karma.todo[key];
    }
};

exports.apply_award = function (connection, nl, award) {
    var plugin = this;
    if (!award) { return; }
    if (isNaN(award)) {    // garbage in config
        connection.logerror(plugin, 'non-numeric award from: ' + nl + ':' +
                award);
        return;
    }

    var bits = nl.split('@'); nl = bits[0];  // strip off @... if present

    connection.results.incr(plugin, {score: award});
    connection.logdebug(plugin, 'applied ' + nl + ':' + award);

    var trimmed = nl.substring(0, 5) === 'notes' ? nl.substring(6) :
                  nl.substring(0, 7) === 'results' ? nl.substring(8) :
                  nl.substring(0,19) === 'transaction.results' ?
                  nl.substring(20) : nl;

    if (trimmed.substring(0,7) === 'rcpt_to') trimmed = trimmed.substring(8);
    if (trimmed.substring(0,7) === 'mail_from') trimmed = trimmed.substring(10);
    if (trimmed.substring(0,7) === 'connect') trimmed = trimmed.substring(8);
    if (trimmed.substring(0,4) === 'data') trimmed = trimmed.substring(5);

    if (award > 0) { connection.results.add(plugin, {pass: trimmed}); }
    if (award < 0) { connection.results.add(plugin, {fail: trimmed}); }
};

exports.check_spammy_tld = function (mail_from, connection) {
    var plugin = this;
    if (!plugin.cfg.spammy_tlds) { return; }
    if (mail_from.isNull()) { return; }         // null sender (bounce)

    var from_tld = mail_from.host.split('.').pop();
    // connection.logdebug(plugin, 'from_tld: ' + from_tld);

    var tld_penalty = parseFloat(plugin.cfg.spammy_tlds[from_tld] || 0);
    if (tld_penalty === 0) { return; }

    connection.results.incr(plugin, {score: tld_penalty});
    connection.results.add(plugin, {fail: 'spammy.TLD'});
};

exports.check_syntax_RcptTo = function (connection) {
    var plugin = this;

    // look for an illegal (RFC 5321,(2)821) space in envelope recipient
    var full_rcpt = connection.current_line;
    if (full_rcpt.toUpperCase().substring(0,9) === 'RCPT TO:<') { return; }

    connection.loginfo(plugin, 'illegal envelope address format: ' +
            full_rcpt );
    connection.results.add(plugin, {fail: 'rfc5321.RcptTo'});
};

exports.assemble_note_obj = function(prefix, key) {
    var note = prefix;
    var parts = key.split('.');
    while (parts.length > 0) {
        var next = parts.shift();
        if (phase_prefixes[next]) {
            next = next + '.' + parts.shift();
        }
        note = note[next];
        if (note === null || note === undefined) { break; }
    }
    return note;
};

exports.check_asn = function (connection, asnkey) {
    var plugin = this;

    var report_as = plugin;
    var report_msg = 'asn';

    if (plugin.cfg.asn.report_as) {
        report_as = { name: plugin.cfg.asn.report_as };
        report_msg = 'karma';
    }

    plugin.db.hgetall(asnkey, function (err, res) {
        if (err) {
            connection.results.add(plugin, {err: err});
            return;
        }

        if (res === null) {
            var expire = (plugin.cfg.redis.expire_days || 60) * 86400; // days
            plugin.init_asn(asnkey, expire);
            return;
        }

        plugin.db.hincrby(asnkey, 'connections', 1);
        var asn_score = parseInt(res.good || 0) - (res.bad || 0);
        if (asn_score) {
            if (asn_score < -5) {
                connection.results.add(report_as, {fail: report_msg});
            }
            else if (asn_score > 5) {
                connection.results.add(report_as, {pass: report_msg});
            }
        }

        if (parseInt(res.bad) > 5 && parseInt(res.good) === 0) {
            connection.results.add(report_as, {fail: 'asn_all_bad'});
        }
        if (parseInt(res.good) > 5 && parseInt(res.bad) === 0) {
            connection.results.add(report_as, {pass: 'asn_all_good'});
        }

        connection.results.add(report_as, {
            asn_score: asn_score,
            asn_connections: res.connections,
            asn_good: res.good,
            asn_bad: res.bad,
            emit: true,
        });
    });
};

// Redis DB functions
exports.init_ip = function (dbkey, rip, expire) {
    var plugin = this;
    plugin.db.multi()
        .hmset(dbkey, {'bad': 0, 'good': 0, 'connections': 1})
        .expire(dbkey, expire)
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
