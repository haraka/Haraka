// DNS list module
const dns         = require('dns');
const net         = require('net');
const net_utils   = require('haraka-net-utils');
const async       = require('async');

exports.enable_stats = false;
exports.disable_allowed = false;
exports.redis_host = '127.0.0.1:6379';
let redis_client;

exports.lookup = function (lookup, zone, cb) {

    if (!lookup || !zone) {
        return setImmediate(() => cb(new Error('missing data')));
    }

    if (this.enable_stats) { this.init_redis(); }

    // Reverse lookup if IPv4 address
    if (net.isIPv4(lookup)) {
        lookup = lookup.split('.').reverse().join('.');
    }
    else if (net.isIPv6(lookup)) {
        lookup = net_utils.ipv6_reverse(lookup);
    }

    let start;
    if (this.enable_stats) {
        start = new Date().getTime();
    }

    // Build the query, adding the root dot if missing
    let query = [lookup, zone].join('.');
    if (!query.endsWith('.')) {
        query += '.';
    }
    this.logdebug(`looking up: ${query}`);
    // IS: IPv6 compatible (maybe; only if BL return IPv4 answers)
    dns.resolve(query, 'A', (err, a) => {
        this.stats_incr_zone(err, zone, start);  // Statistics

        // Check for a result of 127.0.0.1 or outside 127/8
        // This should *never* happen on a proper DNS list
        if (a && ((!this.lookback_is_rejected && a.includes('127.0.0.1')) ||
                a.find((rec) => { return rec.split('.')[0] !== '127' }))
        ) {
            this.disable_zone(zone, a);
            return cb(err, null);  // Return a null A record
        }

        // <https://www.spamhaus.org/news/article/807/using-our-public-mirrors-check-your-return-codes-now>
        if (a?.includes('127.255.255.')) {
            this.disable_zone(zone, a);
            return cb(err, null);  // Return a null A record
        }

        if (err) {
            if (err.code === dns.TIMEOUT) {         // list timed out
                this.disable_zone(zone, err.code); // disable it
            }
            if (err.code === dns.NOTFOUND) {  // unlisted
                return cb(null, a);          // not an error for a DNSBL
            }
        }
        return cb(err, a);
    });
}

exports.stats_incr_zone = function (err, zone, start) {
    if (!this.enable_stats) return;

    const rkey = `dns-list-stat:${zone}`;
    const elapsed = new Date().getTime() - start;
    redis_client.hIncrBy(rkey, 'TOTAL', 1);
    const foo = (err) ? err.code : 'LISTED';
    redis_client.hIncrBy(rkey, foo, 1);
    redis_client.hGet(rkey, 'AVG_RT').then(rt => {
        const avg = parseInt(rt) ? (parseInt(elapsed) + parseInt(rt))/2
            : parseInt(elapsed);
        redis_client.hSet(rkey, 'AVG_RT', avg);
    });
}

exports.init_redis = function () {
    if (redis_client) { return; }

    const redis = require('redis');
    const host_port = this.redis_host.split(':');
    const host = host_port[0] || '127.0.0.1';
    const port = parseInt(host_port[1], 10) || 6379;

    redis_client = redis.createClient(port, host);
    redis_client.connect().then(() => {
        redis_client.on('error', err => {
            this.logerror(`Redis error: ${err}`);
            redis_client.quit();
            redis_client = null; // should force a reconnect
            // not sure if that's the right thing but better than nothing...
        })
    })
}

exports.multi = function (lookup, zones, cb) {
    if (!lookup) return cb();
    if (!zones ) return cb();
    if (typeof zones === 'string') zones = [ `${zones}` ];
    const self = this;
    const listed = [];

    function redis_incr (zone) {
        if (!self.enable_stats) return;

        // Statistics: check hit overlap
        for (const element of listed) {
            const foo = (element === zone) ? 'TOTAL' : element;
            redis_client.hIncrBy(`dns-list-overlap:${zone}`, foo, 1);
        }
    }

    function zoneIter (zone, done) {
        self.lookup(lookup, zone, (err, a) => {
            if (a) {
                listed.push(zone);
                redis_incr(zone);
            }
            cb(err, zone, a, true);
            done();
        })
    }
    function zonesDone (err) {
        cb(err, null, null, false);
    }
    async.each(zones, zoneIter, zonesDone);
}

// Return first positive or last result.
exports.first = function (lookup, zones, cb, cb_each) {
    if (!lookup || !zones) return cb();
    if (typeof zones === 'string') zones = [ `${zones}` ];
    let ran_cb = false;
    this.multi(lookup, zones, (err, zone, a, pending) => {
        if (zone && cb_each && typeof cb_each === 'function') {
            cb_each(err, zone, a);
        }
        if (ran_cb) return;
        if (pending && (err || !a)) return;

        // has pending queries OR this one is a positive result
        ran_cb = true;
        cb(err, zone, a);
    })
}

exports.check_zones = function (interval) {
    this.disable_allowed = true;
    if (interval) interval = parseInt(interval);
    if ((this.zones?.length) ||
        (this.disabled_zones?.length)) {
        let zones = [];
        if (this.zones?.length) zones = zones.concat(this.zones);
        if (this.disabled_zones?.length) {
            zones = zones.concat(this.disabled_zones);
        }

        // A DNS list should never return positive or an error for this lookup
        // If it does, move it to the disabled list
        this.multi('127.0.0.1', zones, (err, zone, a, pending) => {
            if (!zone) return;

            if ((!this.lookback_is_rejected && a) || (err && err.code === 'ETIMEOUT')) {
                return this.disable_zone(zone, ((a) ? a : err.code));
            }

            // Try the test point
            this.lookup('127.0.0.2', zone, (err2, a2) => {
                if (!a2) {
                    this.logwarn(`zone '${zone}' did not respond to test point (${err2})`);
                    return this.disable_zone(zone, a2);
                }
                // Was this zone previously disabled?
                if (!this.zones.includes(zone)) {
                    this.loginfo(`re-enabling zone ${zone}`);
                    this.zones.push(zone);
                }
            });
        });
    }
    // Set a timer to re-test
    if (interval && interval >= 5 && !this._interval) {
        this.logdebug(`will re-test list zones every ${interval} minutes`);
        this._interval = setInterval(() => {
            this.check_zones();
        }, (interval * 60) * 1000);
    }
}

exports.shutdown = function () {
    clearInterval(this._interval);
    if (redis_client) redis_client.quit();
}

exports.disable_zone = function (zone, result) {
    if (!zone) return false;
    if (!this.zones) return false;
    if (!this.zones.length) return false;
    if (!this.disable_allowed) return false;

    const idx = this.zones.indexOf(zone);
    if (idx === -1) return false;  // not enabled

    this.zones.splice(idx, 1);
    if (!(this.disabled_zones?.length)) {
        this.disabled_zones = [];
    }
    if (!this.disabled_zones.includes(zone)) {
        this.disabled_zones.push(zone);
    }
    this.logwarn(`disabling zone '${zone}'${result ? `: ${result}` : ''}`);
    return true;
}
