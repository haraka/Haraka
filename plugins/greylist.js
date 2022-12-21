// Greylisting plugin for Haraka

// version 0.1.4

// node builtins
const net    = require('net');
const util   = require('util');

// Haraka modules
const DSN       = require('haraka-dsn');
const tlds      = require('haraka-tld');
const net_utils = require('haraka-net-utils');
const { Address }   = require('address-rfc2821');

// External NPM modules
const ipaddr    = require('ipaddr.js');

// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
exports.register = function (next) {
    this.inherits('haraka-plugin-redis');

    this.load_config();

    this.register_hook('init_master', 'init_redis_plugin');
    this.register_hook('init_child',  'init_redis_plugin');

    // redundant - using the special hook_ nomenclature
    // this.register_hook('rcpt_ok', 'hook_rcpt_ok');
}

// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
exports.load_config = function () {

    this.cfg = this.config.get('greylist.ini', {
        booleans : [
            '+skip.dnswlorg',
            '-skip.mailspikewl'
        ]
    }, () => {
        this.load_config();
    });

    this.merge_redis_ini();
    this.load_config_lists();
}

// Load various configuration lists
exports.load_config_lists = function () {
    const plugin = this;

    plugin.whitelist = {};
    plugin.list = {};

    function load_list (type, file_name) {
        plugin.whitelist[type] = {};

        const list = Object.keys(plugin.cfg[file_name]);

        // toLower when loading spends a fraction of a second at load time
        // to save millions of seconds during run time.
        for (const element of list) {
            plugin.whitelist[type][element.toLowerCase()] = true;
        }
        plugin.logdebug(`whitelist {${type}} loaded from ${file_name} with ${list.length} entries`);
    }

    function load_ip_list (type, file_name) {
        plugin.whitelist[type] = [];

        const list = Object.keys(plugin.cfg[file_name]);

        for (const element of list) {
            try {
                let addr = element;
                addr = addr.match(/\/\d+$/) ? ipaddr.parseCIDR(addr) : ipaddr.parseCIDR(`${addr}${((net.isIPv6(addr)) ? '/128' : '/32')}`);

                plugin.whitelist[type].push(addr);
            }
            catch (e) {}
        }

        plugin.logdebug(`whitelist {${type}} loaded from ${file_name} with ${plugin.whitelist[type].length} entries`);
    }

    function load_config_list (type, file_name) {
        plugin.list[type] = Object.keys(plugin.cfg[file_name]);

        plugin.logdebug(`list {${type}} loaded from ${file_name} with ${plugin.list[type].length} entries`);
    }

    load_list('mail', 'envelope_whitelist');
    load_list('rcpt', 'recipient_whitelist');
    load_ip_list('ip', 'ip_whitelist');

    load_config_list('dyndom', 'special_dynamic_domains');
}

// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
exports.shutdown = function () {
    if (this.db) this.db.quit();
}

// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -

// We check for IP and envelope whitelist
exports.hook_mail = function (next, connection, params) {
    if (!connection.transaction) return next();

    const mail_from = params[0];

    // whitelist checks
    if (this.ip_in_list(connection.remote.ip)) { // check connecting IP

        this.loginfo(connection, 'Connecting IP was whitelisted via config');
        connection.transaction.results.add(this, { skip : 'config-whitelist(ip)' })

    }
    else if (this.addr_in_list('mail', mail_from.address().toLowerCase())) { // check envelope (email & domain)

        this.loginfo(connection, 'Envelope was whitelisted via config');
        connection.transaction.results.add(this, { skip : 'config-whitelist(envelope)' });

    }
    else {
        const why_skip = this.process_skip_rules(connection);

        if (why_skip) {
            this.loginfo(connection, `Requested to skip the GL because skip rule matched: ${why_skip}`);
            connection.transaction.results.add(this, { skip : `requested(${why_skip})` });
        }
    }

    next();
}

//
exports.hook_rcpt_ok = function (next, connection, rcpt) {

    if (this.should_skip_check(connection)) return next();
    if (this.was_whitelisted_in_session(connection)) {
        this.logdebug(connection, 'host already whitelisted in this session');
        return next();
    }

    const { transaction } = connection

    const ctr = transaction.results;
    const { mail_from } = transaction;

    // check rcpt in whitelist (email & domain)
    if (this.addr_in_list('rcpt', rcpt.address().toLowerCase())) {
        this.loginfo(connection, 'RCPT was whitelisted via config');
        ctr.add(this, { skip : 'config-whitelist(recipient)' });
        return next();
    }

    this.check_and_update_white(connection, (err, white_rec) => {
        if (err) {
            this.logerror(connection, `Got error: ${util.inspect(err)}`);
            return next(DENYSOFT, DSN.sec_unspecified('Backend failure. Please, retry later or contact our support.'));
        }
        if (white_rec) {
            this.logdebug(connection, 'host in WHITE zone');
            ctr.add(this, { pass : 'whitelisted' });
            ctr.push(this, { stats : { rcpt : white_rec }, stage : 'rcpt' });

            return next();
        }

        return this.process_tuple(connection, mail_from.address(), rcpt.address(), (err2, white_promo_rec) => {
            if (err2) {
                if (err2 instanceof Error && err2.notanerror) {
                    this.logdebug(connection, 'host in GREY zone');

                    ctr.add(this, {
                        fail : 'greylisted'
                    });
                    ctr.push(this, {
                        stats : {
                            rcpt : err2.record
                        },
                        stage : 'rcpt'
                    });

                    return this.invoke_outcome_cb(next, false);
                }

                throw err2;
            }

            if (white_promo_rec) {
                this.loginfo(connection, 'host has been promoted to WHITE zone');
                ctr.add(this, {
                    pass : 'whitelisted',
                    stats : white_promo_rec,
                    stage : 'rcpt'
                });
                ctr.add(this, {
                    pass : 'whitelisted'
                });
                return this.invoke_outcome_cb(next, true);
            }
            else {
                ctr.add(this, {
                    fail : 'greylisted',
                    stage : 'rcpt'
                });
                return this.invoke_outcome_cb(next, false);
            }
        })
    })
}

// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -

// Main GL engine that accepts tuple and returns matched record or a rejection.
exports.process_tuple = function (connection, sender, rcpt, cb) {

    const key = this.craft_grey_key(connection, sender, rcpt);
    if (!key) return;

    return this.db_lookup(key, (err, record) => {
        if (err) {
            if (err instanceof Error && err.what == 'db_error')
                this.logwarn(connection, `got err from DB: ${util.inspect(err)}`);
            throw err;
        }
        this.logdebug(connection, `got record: ${util.inspect(record)}`);

        // { created: TS, updated: TS, lifetime: TTL, tried: Integer }
        const now = Date.now() / 1000;

        if (record &&
            (record.created + this.cfg.period.black < now) &&
            (record.created + record.lifetime >= now)) {
            // Host passed greylisting
            return this.promote_to_white(connection, record, cb);
        }

        return this.update_grey(key, !record, (err2, created_record) => {
            const err3 = new Error('in black zone');
            err3.record = created_record || record;
            err3.notanerror = true;
            return cb(err3, null);
        });
    });
}

// Checks if host is _white_. Updates stats if so.
exports.check_and_update_white = function (connection, cb) {

    const key = this.craft_white_key(connection);

    return this.db_lookup(key, (err, record) => {
        if (err) {
            this.logwarn(connection, `got err from DB: ${util.inspect(err)}`);
            throw err;
        }
        if (record) {
            if (record.updated + record.lifetime - 2 < Date.now() / 1000) { // race "prevention".
                this.logerror(connection, "Mischief! Race condition triggered.");
                return cb(new Error('drunkard'));
            }

            return this.update_white_record(key, record, cb);
        }

        return cb(null, false);
    });
}

// invokes next() depending on outcome param
exports.invoke_outcome_cb = function (next, is_whitelisted) {

    if (is_whitelisted) return next();

    const text = this.cfg.main.text || '';

    return next(DENYSOFT, DSN.sec_unauthorized(text, '451'));
}

// Should we skip greylisting invokation altogether?
exports.should_skip_check = function (connection) {
    const { transaction, relaying, remote } = connection ?? {}

    if (!transaction) return true;

    const ctr = transaction.results;

    if (relaying) {
        this.logdebug(connection, 'skipping GL for relaying host');
        ctr.add(this, {
            skip : 'relaying'
        });
        return true;
    }

    if (remote?.is_private) {
        connection.logdebug(this, `skipping private IP: ${connection.remote.ip}`);
        ctr.add(this, {
            skip : 'private-ip'
        });
        return true;
    }

    if (ctr) {
        if (ctr.has(this, 'skip', /^config-whitelist/)) {
            this.loginfo(connection, 'skipping GL for host whitelisted in config');
            return true;
        }
        if (ctr.has(this, 'skip', /^requested/)) {
            this.loginfo(connection, 'skipping GL because was asked to previously');
            return true;
        }
    }

    return false;
}

// Was whitelisted previously in this session
exports.was_whitelisted_in_session = function (connection) {
    if (!connection?.transaction?.results) return false;
    return connection.transaction.results.has(this, 'pass', 'whitelisted');
}

exports.process_skip_rules = function (connection) {
    const cr = connection.results;

    const skip_cfg = this.cfg.skip;
    if (skip_cfg) {
        if (skip_cfg.dnswlorg && cr.has('dnswl.org', 'pass', /^list\.dnswl\.org\([123]\)$/)) {
            return 'dnswl.org(MED)'
        }

        if (skip_cfg.mailspikewl && cr.has('dnswl.org', 'pass', /^wl\.mailspike\.net\((1[7-9]|20)\)$/)) {
            return 'mailspike(H2)'
        }
    }

    return false;
}

// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -

// Build greylist DB key (originally, a "tuple") off supplied params.
// When _to_ is false, we craft +sender+ key
// When _to_ is String, we craft +rcpt+ key
exports.craft_grey_key = function (connection, from, to) {

    const crafted_host_id = this.craft_hostid(connection)
    if (!crafted_host_id) return null;

    let key = `grey:${crafted_host_id}:${(from || '<>')}`;
    if (to != undefined) {
        key += `:${(to || '<>')}`;
    }
    return key;
}

// Build white DB key off supplied params.
exports.craft_white_key = function (connection) {
    return `white:${this.craft_hostid(connection)}`;
}

// Return so-called +hostid+.
exports.craft_hostid = function (connection) {
    const plugin = this;
    const { transaction, remote } = connection ?? {};
    if (!transaction || !remote) return null;

    if (transaction.notes?.greylist?.hostid) {
        return transaction.notes.greylist.hostid; // "caching"
    }

    function chsit (value, reason) { // cache the return value
        if (!value)
            plugin.logdebug(connection, `hostid set to IP: ${reason}`);

        transaction.results.add(plugin, {
            hostid_type : value ? 'domain' : 'ip',
            rdns : (value || remote.ip),
            msg : reason
        }); // !don't move me.

        value = value || remote.ip;

        return ((transaction.notes.greylist = transaction.notes.greylist || {}).hostid = value);
    }

    // no rDNS . FIXME: use fcrdns results
    if (!remote.host || [ 'Unknown' | 'DNSERROR' ].includes(remote.host))
        return chsit(null, 'no rDNS info for this host');

    remote.host = remote.host.replace(/\.$/, ''); // strip ending dot, just in case

    const fcrdns = connection.results.get('fcrdns');
    if (!fcrdns) {
        plugin.logwarn(connection, 'No FcrDNS plugin results, fix this.');
        return chsit(null, 'no FcrDNS plugin results');
    }

    if (!connection.results.has('fcrdns', 'pass', 'fcrdns')) // FcrDNS failed
        return chsit(null, 'FcrDNS failed');

    if (connection.results.get('fcrdns').ptr_names.length > 1) // multiple PTR returned
        return chsit(null, 'multiple PTR returned');

    if (connection.results.has('fcrdns', 'fail', /^is_generic/)) // generic/dynamic rDNS record
        return chsit(null, 'rDNS is a generic record');

    if (connection.results.has('fcrdns', 'fail', /^valid_tld/)) // invalid org domain in rDNS
        return chsit(null, 'invalid org domain in rDNS');

    // strip first label up until the tld boundary.
    const decoupled = tlds.split_hostname(!remote.host, 3);
    const vardom = decoupled[0]; // "variable" portion of domain
    const dom = decoupled[1]; // "static" portion of domain

    // we check for special cases where rdns looks custom/static, but really is dynamic
    const special_case_info = plugin.check_rdns_for_special_cases(!remote.host, vardom);
    if (special_case_info) return chsit(null, special_case_info.why);

    let stripped_dom = dom;

    if (vardom) {

        // check for decimal IP in rDNS
        if (vardom.match(String(net_utils.ip_to_long(remote.ip))))
            return chsit(null, 'decimal IP');

        // craft the +hostid+
        const label = vardom.split('.').slice(1).join('.');
        if (label)
            stripped_dom = `${label}.${stripped_dom}`;
    }

    return chsit(stripped_dom);
}

// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -

// Retrieve _grey_ record
// not implemented
exports.retrieve_grey = function (rcpt_key, sender_key, cb) {
    const multi = this.db.multi();

    multi.hgetall(rcpt_key);
    multi.hgetall(sender_key);

    multi.exec((err, result) => {
        if (err) {
            this.lognotice(`DB error: ${util.inspect(err)}`);
            err.what = 'db_error';
            throw err;
        }
        return cb(err, result);
    });
}

// Update or create _grey_ record
exports.update_grey = function (key, create, cb) {
    const multi = this.db.multi();

    const ts_now = Math.round(Date.now() / 1000);
    let new_record;

    if (create) {
        const lifetime = this.cfg.period.grey;
        new_record = {
            created : ts_now,
            updated : ts_now,
            lifetime,
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

    multi.exec((err, records) => {
        if (err) {
            this.lognotice(`DB error: ${util.inspect(err)}`);
            err.what = 'db_error';
            throw err;
        }
        return cb(null, ((create) ? new_record : false));
    });
}

// Promote _grey_ record to _white_.
exports.promote_to_white = function (connection, grey_rec, cb) {

    const ts_now = Math.round(Date.now() / 1000);
    const white_ttl = this.cfg.period.white;

    // { first_connect: TS, whitelisted: TS, updated: TS, lifetime: TTL, tried: Integer, tried_when_greylisted: Integer }
    const white_rec = {
        first_connect : grey_rec.created,
        whitelisted : ts_now,
        updated : ts_now,
        lifetime : white_ttl,
        tried_when_greylisted : grey_rec.tried,
        tried : 1
    };

    const white_key = this.craft_white_key(connection);
    if (!white_key) return;

    return this.db.hmset(white_key, white_rec, (err, result) => {
        if (err) {
            this.lognotice(`DB error: ${util.inspect(err)}`);
            err.what = 'db_error';
            throw err;
        }
        this.db.expire(white_key, white_ttl, (err2, result2) => {
            if (err2) {
                this.lognotice(`DB error: ${util.inspect(err2)}`);
            }
            return cb(err2, result2);
        });
    });
}

// Update _white_ record
exports.update_white_record = function (key, record, cb) {

    const multi = this.db.multi();
    const ts_now = Math.round(Date.now() / 1000);

    // { first_connect: TS, whitelisted: TS, updated: TS, lifetime: TTL, tried: Integer, tried_when_greylisted: Integer }
    multi.hincrby(key, 'tried', 1);
    multi.hmset(key, {
        updated : ts_now
    });
    multi.expire(key, record.lifetime);

    return multi.exec((err2, record2) => {
        if (err2) {
            this.lognotice(`DB error: ${util.inspect(err2)}`);
            err2.what = 'db_error';
            throw err2;
        }
        return cb(null, record2);
    });
}

// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -

exports.db_lookup = function (key, cb) {

    this.db.hgetall(key, (err, result) => {
        if (err) {
            this.lognotice(`DB error: ${util.inspect(err)}`, key);
        }
        if (result && typeof result === 'object') { // groom known-to-be numeric values
            ['created', 'updated', 'lifetime', 'tried', 'first_connect', 'whitelisted', 'tried_when_greylisted'].forEach(kk => {
                const val = result[kk];
                if (val !== undefined) {
                    result[kk] = Number(val);
                }
            });
        }
        return cb(null, result);
    });
}

// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
exports.addr_in_list = function (type, address) {

    if (!this.whitelist[type]) {
        this.logwarn(`List not defined: ${type}`);
        return false;
    }

    if (this.whitelist[type][address]) {
        return true;
    }

    try {
        const addr = new Address(address);
        return !!this.whitelist[type][addr.host];
    }
    catch (err) {
        return false;
    }
}

exports.ip_in_list = function (ip) {
    const ipobj = ipaddr.parse(ip);

    const list = this.whitelist.ip;

    for (const element of list) {
        try {
            if (ipobj.match(element)) {
                return true;
            }
        }
        catch (e) {}
    }

    return false;
}

// Match patterns in the list against (end of) domain
exports.domain_in_list = function (list_name, domain) {
    const list = this.list[list_name];

    if (!list) {
        this.logwarn(`List not defined: ${list_name}`);
        return false;
    }

    for (const element of list) {
        if (domain.length - domain.lastIndexOf(element) == element.length)
            return true;
    }

    return false;
}

// Check for special rDNS cases
// @return {type: 'dynamic'} if rnds is dynamic (hostid should be IP)
exports.check_rdns_for_special_cases = function (domain, label) {

    // ptr for these is in fact dynamic
    if (this.domain_in_list('dyndom', domain))
        return {
            type : 'dynamic',
            why : 'rDNS considered dynamic: listed in dynamic.domains config list'
        };

    return false;
}
