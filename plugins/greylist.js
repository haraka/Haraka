// Greylisting Haraka plugin

// version 0.1.3

var util = require('util');
var redis = require('redis');
var tlds  = require('haraka-tld');
var isIPv6 = require('net').isIPv6;

var ipaddr = require('ipaddr.js');

var DSN = require('./dsn');
var net_utils = require('haraka-net-utils');
var Address = require('address-rfc2821').Address;

// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
exports.register = function (next) {
    var plugin = this;

    plugin.load_config();
    plugin.load_config_lists();

    this.register_hook('init_master', 'redis_onInit');
    this.register_hook('init_child', 'redis_onInit');

    this.register_hook('rcpt_ok', 'hook_rcpt_ok');
};

// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
exports.load_config = function () {
    var plugin = this;

    plugin.cfg = plugin.config.get('greylist.ini', {
        booleans : [
            '+skip.dnswlorg',
            '-skip.mailspikewl'
        ]
    }, function () {
        plugin.load_config();
    });

    plugin.load_config_lists();
};

// Load various configuration lists
exports.load_config_lists = function () {
    var plugin = this;

    plugin.whitelist = {};
    plugin.list = {};

    function load_list(type, file_name) {
        plugin.whitelist[type] = {};

        var list = Object.keys(plugin.cfg[file_name]);

        // toLower when loading spends a fraction of a second at load time
        // to save millions of seconds during run time.
        for (var i = 0; i < list.length; i++) {
            plugin.whitelist[type][list[i].toLowerCase()] = true;
        }
        plugin.logdebug('whitelist {' + type + '} loaded from ' + file_name + ' with ' + list.length + ' entries');
    }

    function load_ip_list(type, file_name) {
        plugin.whitelist[type] = [];

        var list = Object.keys(plugin.cfg[file_name]);

        for (var i = 0; i < list.length; i++) {
            try {
                var addr = list[i];
                if (addr.match(/\/\d+$/)) {
                    addr = ipaddr.parseCIDR(addr);
                }
                else {
                    addr = ipaddr.parseCIDR(addr + ((isIPv6(addr)) ? '/128' : '/32'));
                }

                plugin.whitelist[type].push(addr);
            } catch (e) {}
        }

        plugin.logdebug('whitelist {' + type + '} loaded from ' + file_name + ' with ' + plugin.whitelist[type].length + ' entries');
    }

    function load_config_list(type, file_name) {
        plugin.list[type] = Object.keys(plugin.cfg[file_name]);

        plugin.logdebug('list {' + type + '} loaded from ' + file_name + ' with ' + plugin.list[type].length + ' entries');
    }

    load_list('mail', 'envelope_whitelist');
    load_list('rcpt', 'recipient_whitelist');
    load_ip_list('ip', 'ip_whitelist');

    load_config_list('dyndom', 'special_dynamic_domains');
};

// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
exports.redis_onInit = function (next, server) {
    var plugin = this;

    if (plugin.redis)
        return next();

    /*
    var r_opts = {
        connect_timeout: 1000
    };
    */

    var next_called;

    plugin.redis = redis.createClient(plugin.cfg.redis.port, plugin.cfg.redis.host);

    plugin.redis.on('error', function (err) {
        plugin.logerror(err);
        plugin.logerror("[gl] Redis error: " + err + '. Reconnecting...');
    })
    .on('ready', function () {
        plugin.loginfo('[gl] Redis connected to ' + plugin.redis.host + ':' + (plugin.redis.port || 0) +
            '/' + (plugin.cfg.redis.db || 0) + ' v' + plugin.redis.server_info.redis_version);

        if (plugin.cfg.redis.db) {
            plugin.redis.select(plugin.cfg.redis.db, function () {
                if (!next_called) {
                    next_called = true;
                    return next();
                }
            });
        }
        else if (!next_called) {
            next_called = true;
            return next();
        }
    });
};

exports.shutdown = function () {
    if (this.redis) {
        this.redis.quit();
    }
}

// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -

// We check for IP and envelope whitelist
exports.hook_mail = function (next, connection, params) {
    var plugin = this;
    var mail_from = params[0];

    // whitelist checks
    if (plugin.ip_in_list(connection.remote.ip)) { // check connecting IP

        plugin.loginfo(connection, 'Connecting IP was whitelisted via config');
        connection.transaction.results.add(plugin, {
            skip : 'config-whitelist(ip)'
        });

    }
    else if (plugin.addr_in_list('mail', mail_from.address().toLowerCase())) { // check envelope (email & domain)

        plugin.loginfo(connection, 'Envelope was whitelisted via config');
        connection.transaction.results.add(plugin, {
            skip : 'config-whitelist(envelope)'
        });

    }
    else {
        var why_skip = plugin.process_skip_rules(connection);

        if (why_skip) {
            plugin.loginfo(connection, 'Requested to skip the GL because skip rule matched: ' + why_skip);
            connection.transaction.results.add(plugin, {
                skip : 'requested(' + why_skip + ')'
            });
        }
    }

    return next();
};

//
exports.hook_rcpt_ok = function (next, connection, rcpt) {
    var plugin = this;

    if (plugin.should_skip_check(connection)) return next();

    if (plugin.was_whitelisted_in_session(connection)) {
        plugin.logdebug(connection, 'host already whitelisted in this session');
        return next();
    }

    var ctr = connection.transaction.results;
    var mail_from = connection.transaction.mail_from;

    // check rcpt in whitelist (email & domain)
    if (plugin.addr_in_list('rcpt', rcpt.address().toLowerCase())) {
        plugin.loginfo(connection, 'RCPT was whitelisted via config');
        ctr.add(plugin, {
            skip : 'config-whitelist(recipient)'
        });
        return next();
    }

    plugin.check_and_update_white(connection, function (err, white_rec) {
        if (err) {
            plugin.logerror(connection, 'Got error: ' + util.inspect(err));
            return next(DENYSOFT, DSN.sec_unspecified('Backend failure. Please, retry later or contact our support.'));
        }
        if (white_rec) {
            plugin.logdebug(connection, 'host in WHITE zone');
            ctr.add(plugin, {
                pass : 'whitelisted'
            });
            ctr.push(plugin, {
                stats : {
                    rcpt : white_rec
                },
                stage : 'rcpt'
            });

            return next();
        }
        else {

            return plugin.process_tuple(connection, mail_from.address(), rcpt.address(), function (err2, white_promo_rec) {
                if (err2) {
                    if (err2 instanceof Error && err2.notanerror) {
                        plugin.logdebug(connection, 'host in GREY zone');

                        ctr.add(plugin, {
                            fail : 'greylisted'
                        });
                        ctr.push(plugin, {
                            stats : {
                                rcpt : err2.record
                            },
                            stage : 'rcpt'
                        });

                        return plugin.invoke_outcome_cb(next, false);
                    }

                    throw err2;
                }

                if (!white_promo_rec) {
                    ctr.add(plugin, {
                        fail : 'greylisted',
                        stage : 'rcpt'
                    });
                    return plugin.invoke_outcome_cb(next, false);
                }
                else {
                    plugin.loginfo(connection, 'host has been promoted to WHITE zone');
                    ctr.add(plugin, {
                        pass : 'whitelisted',
                        stats : white_promo_rec,
                        stage : 'rcpt'
                    });
                    ctr.add(plugin, {
                        pass : 'whitelisted'
                    });
                    return plugin.invoke_outcome_cb(next, true);
                }
            });
        }
    });
};

// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -

// Main GL engine that accepts tuple and returns matched record or a rejection.
exports.process_tuple = function (connection, sender, rcpt, cb) {
    var plugin = this;

    var key = plugin.craft_grey_key(connection, sender, rcpt);

    return plugin.db_lookup(key, function (err, record) {
        if (err) {
            if (err instanceof Error && err.what == 'db_error')
                plugin.logwarn(connection, "got err from DB: " + util.inspect(err));
            throw err;
        }
        plugin.logdebug(connection, 'got record: ' + util.inspect(record));

        // { created: TS, updated: TS, lifetime: TTL, tried: Integer }
        var now = Date.now() / 1000;

        if (record &&
            (record.created + plugin.cfg.period.black < now) &&
            (record.created + record.lifetime >= now)) {
            // Host passed greylisting
            return plugin.promote_to_white(connection, record, cb);
        }

        return plugin.update_grey(key, !record, function (err2, created_record) {
            var err2 = new Error('in black zone');
            err2.record = created_record || record;
            err2.notanerror = true;
            return cb(err2, null);
        });
    });
};

// Checks if host is _white_. Updates stats if so.
exports.check_and_update_white = function (connection, cb) {
    var plugin = this;

    var key = plugin.craft_white_key(connection);

    return plugin.db_lookup(key, function (err, record) {
        if (err) {
            plugin.logwarn(connection, "got err from DB: " + util.inspect(err));
            throw err;
        }
        if (record) {
            if (record.updated + record.lifetime - 2 < Date.now() / 1000) { // race "prevention".
                plugin.logerror(connection, "Mischief! Race condition triggered.");
                return cb(new Error('drunkard'));
            }

            return plugin.update_white_record(key, record, cb);
        }

        return cb(null, false);
    });
};

// invokes next() depending on outcome param
exports.invoke_outcome_cb = function (next, is_whitelisted) {
    var plugin = this;

    if (is_whitelisted) {
        return next();
    }
    else {
        var text = plugin.cfg.main.text || '';

        return next(DENYSOFT, DSN.sec_unauthorized(text, '451'));
    }
};

// Should we skip greylisting invokation altogether?
exports.should_skip_check = function (connection) {
    var plugin = this;
    var ctr = connection.transaction && connection.transaction.results;

    if (connection.relaying) {
        plugin.logdebug(connection, 'skipping GL for relaying host');
        ctr.add(plugin, {
            skip : 'relaying'
        });
        return true;
    }

    if (net_utils.is_private_ip(connection.remote.ip)) {
        connection.logdebug(plugin, 'skipping private IP: ' + connection.remote.ip);
        ctr.add(plugin, {
            skip : 'private-ip'
        });
        return true;
    }

    if (ctr) {
        if (ctr.has(plugin, 'skip', /^config\-whitelist/)) {
            plugin.loginfo(connection, 'skipping GL for host whitelisted in config');
            return true;
        }
        if (ctr.has(plugin, 'skip', /^requested/)) {
            plugin.loginfo(connection, 'skipping GL because was asked to previously');
            return true;
        }
    }

    return false;
};

// Was whitelisted previously in this session
exports.was_whitelisted_in_session = function (connection) {
    return connection.transaction.results.has(this, 'pass', 'whitelisted');
};

exports.process_skip_rules = function (connection) {
    var plugin = this;
    var cr = connection.results;

    var skip_cfg = plugin.cfg.skip;
    if (skip_cfg) {
        if (skip_cfg.dnswlorg && cr.has('dnswl.org', 'pass', /^list\.dnswl\.org\([123]\)$/)) {
            return 'dnswl.org(MED)'
        }

        if (skip_cfg.mailspikewl && cr.has('dnswl.org', 'pass', /^wl\.mailspike\.net\((1[7-9]|20)\)$/)) {
            return 'mailspike(H2)'
        }
    }

    return false;
};

// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -

// Build greylist DB key (originally, a "tuple") off supplied params.
// When _to_ is false, we craft +sender+ key
// When _to_ is String, we craft +rcpt+ key
exports.craft_grey_key = function (connection, from, to) {
    var plugin = this;
    var key = 'grey:' + plugin.craft_hostid(connection) + ':' + (from || '<>');
    if (to != undefined) {
        key += ':' + (to || '<>');
    }
    return key;
};

// Build white DB key off supplied params.
exports.craft_white_key = function (connection) {
    var plugin = this;
    return 'white:' + plugin.craft_hostid(connection);
};

// Return so-called +hostid+.
exports.craft_hostid = function (connection) {
    var plugin = this;
    var trx = connection.transaction;

    if (trx.notes.greylist && trx.notes.greylist.hostid)
        return trx.notes.greylist.hostid; // "caching"

    var ip = connection.remote.ip;
    var rdns = connection.remote.host;

    var chsit = function (value, reason) { // cache the return value
        if (!value)
            plugin.logdebug(connection, 'hostid set to IP: ' + reason);

        trx.results.add(plugin, {
            hostid_type : value ? 'domain' : 'ip',
            rdns : (value || ip),
            msg : reason
        }); // !don't move me.

        value = value || ip;

        return ((trx.notes.greylist = trx.notes.greylist || {}).hostid = value);
    };

    if (!rdns || rdns === 'Unknown' || rdns === 'DNSERROR') // no rDNS . FIXME: use fcrdns results
        return chsit(null, 'no rDNS info for this host');

    rdns = rdns.replace(/\.$/, ''); // strip ending dot, just in case

    var fcrdns = connection.results.get('connect.fcrdns');
    if (!fcrdns) {
        plugin.logwarn(connection, 'No FcrDNS plugin results, fix this.');
        return chsit(null, 'no FcrDNS plugin results');
    }

    if (!connection.results.has('connect.fcrdns', 'pass', 'fcrdns')) // FcrDNS failed
        return chsit(null, 'FcrDNS failed');

    if (connection.results.get('connect.fcrdns').ptr_names.length > 1) // multiple PTR returned
        return chsit(null, 'multiple PTR returned');

    if (connection.results.has('connect.fcrdns', 'fail', /^is_generic/)) // generic/dynamic rDNS record
        return chsit(null, 'rDNS is a generic record');

    if (connection.results.has('connect.fcrdns', 'fail', /^valid_tld/)) // invalid org domain in rDNS
        return chsit(null, 'invalid org domain in rDNS');

    // strip first label up until the tld boundary.
    var decoupled = tlds.split_hostname(rdns, 3);
    var vardom = decoupled[0]; // "variable" portion of domain
    var dom = decoupled[1]; // "static" portion of domain

    // we check for special cases where rdns looks custom/static, but really is dynamic
    var special_case_info = plugin.check_rdns_for_special_cases(rdns, vardom);
    if (special_case_info) {
        return chsit(null, special_case_info.why);
    }

    var stripped_dom = dom;

    if (vardom) {

        // check for decimal IP in rDNS
        if (vardom.match(String(net_utils.ip_to_long(ip))))
            return chsit(null, 'decimal IP');

        // craft the +hostid+
        var label = vardom.split('.').slice(1).join('.');
        if (label)
            stripped_dom = label + '.' + stripped_dom;
    }

    return chsit(stripped_dom);
};

// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -

// Retrieve _grey_ record
// not implemented
exports.retrieve_grey = function (rcpt_key, sender_key, cb) {
    var plugin = this;
    var multi = plugin.redis.multi();

    multi.hgetall(rcpt_key);
    multi.hgetall(sender_key);

    return multi.exec(function (err, result) {
        if (err) {
            plugin.lognotice("DB error: " + util.inspect(err));
            err.what = 'db_error';
            throw err;
        }
        return cb(err, result);
    });
};

// Update or create _grey_ record
exports.update_grey = function (key, create, cb) {
    // { created: TS, updated: TS, lifetime: TTL, tried: Integer }
    var plugin = this;
    var multi = plugin.redis.multi();

    var ts_now = Math.round(Date.now() / 1000);

    if (create) {
        var lifetime = plugin.cfg.period.grey;
        var new_record = {
            created : ts_now,
            updated : ts_now,
            lifetime : lifetime,
            tried : 1
        };

        multi.hmset(key, new_record);
        multi.expire(key, lifetime);
    }
    else {
        multi.hincrby(key, 'tried', 1);
        multi.hmset(key, {
            updated : ts_now
        });
    }

    multi.exec(function (err, records) {
        if (err) {
            plugin.lognotice("DB error: " + util.inspect(err));
            err.what = 'db_error';
            throw err;
        }
        return cb(null, ((create) ? new_record : false));
    });
};

// Promote _grey_ record to _white_.
exports.promote_to_white = function (connection, grey_rec, cb) {
    var plugin = this;

    var ts_now = Math.round(Date.now() / 1000);
    var white_ttl = plugin.cfg.period.white;

    // { first_connect: TS, whitelisted: TS, updated: TS, lifetime: TTL, tried: Integer, tried_when_greylisted: Integer }
    var white_rec = {
        first_connect : grey_rec.created,
        whitelisted : ts_now,
        updated : ts_now,
        lifetime : white_ttl,
        tried_when_greylisted : grey_rec.tried,
        tried : 1
    };

    var white_key = plugin.craft_white_key(connection);

    return plugin.redis.hmset(white_key, white_rec, function (err, result) {
        if (err) {
            plugin.lognotice("DB error: " + util.inspect(err));
            err.what = 'db_error';
            throw err;
        }
        plugin.redis.expire(white_key, white_ttl, function (err2, result2) {
            plugin.lognotice("DB error: " + util.inspect(err2));
            return cb(err2, result2);
        });
    });
};

// Update _white_ record
exports.update_white_record = function (key, record, cb) {
    var plugin = this;

    var multi = plugin.redis.multi();
    var ts_now = Math.round(Date.now() / 1000);

    // { first_connect: TS, whitelisted: TS, updated: TS, lifetime: TTL, tried: Integer, tried_when_greylisted: Integer }
    multi.hincrby(key, 'tried', 1);
    multi.hmset(key, {
        updated : ts_now
    });
    multi.expire(key, record.lifetime);

    return multi.exec(function (err2, record2) {
        if (err2) {
            plugin.lognotice("DB error: " + util.inspect(err2));
            err2.what = 'db_error';
            throw err2;
        }
        return cb(null, record2);
    });
};

// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -

exports.db_lookup = function (key, cb) {
    var plugin = this;

    plugin.redis.hgetall(key, function (err, result) {
        if (err) {
            plugin.lognotice("DB error: " + util.inspect(err), key);
        }
        if (result && typeof result === 'object') { // groom known-to-be numeric values
            ['created', 'updated', 'lifetime', 'tried', 'first_connect', 'whitelisted', 'tried_when_greylisted'].forEach(function (kk) {
                var val = result[kk];
                if (val !== undefined) {
                    result[kk] = Number(val);
                }
            });
        }
        return cb(null, result);
    });
};

// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
exports.addr_in_list = function (type, address) {
    var plugin = this;

    if (!plugin.whitelist[type]) {
        plugin.logwarn("List not defined: " + type);
        return false;
    }

    if (plugin.whitelist[type][address]) {
        return true;
    }

    try {
        var addr = new Address(address);
        return !!plugin.whitelist[type][addr.host];
    } catch (err) {
        return false;
    }
};

exports.ip_in_list = function (ip) {
    var plugin = this;
    var ipobj = ipaddr.parse(ip);

    var list = plugin.whitelist.ip;

    for (var i = 0; i < list.length; i++) {
        try {
            if (ipobj.match(list[i])) {
                return true;
            }
        } catch (e) {}
    }

    return false;
};

// Match patterns in the list against (end of) domain
exports.domain_in_list = function (list_name, domain) {
    var plugin = this;
    var list = plugin.list[list_name];

    if (!list) {
        plugin.logwarn("List not defined: " + list_name);
        return false;
    }

    for (var i = 0; i < list.length; i++) {
        if (domain.length - domain.lastIndexOf(list[i]) == list[i].length)
            return true;
    }

    return false;
};

// Check for special rDNS cases
// @return {type: 'dynamic'} if rnds is dynamic (hostid should be IP)
exports.check_rdns_for_special_cases = function (domain, label) {
    var plugin = this;

    // ptr for these is in fact dynamic
    if (plugin.domain_in_list('dyndom', domain))
        return {
            type : 'dynamic',
            why : 'rDNS considered dynamic: listed in dynamic.domains config list'
        };

    return false;
};
