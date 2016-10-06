// DNS list module
var dns         = require('dns');
var net         = require('net');
var net_utils   = require('haraka-net-utils');
var async       = require('async');

exports.enable_stats = false;
exports.disable_allowed = false;
exports.redis_host = '127.0.0.1:6379';
var redis_client;

exports.lookup = function (lookup, zone, cb) {
    var self = this;

    if (!lookup || !zone) {
        return process.nextTick(function () {
            return cb(new Error('missing data'));
        });
    }

    if (this.enable_stats) { this.init_redis(); }

    // Reverse lookup if IPv4 address
    if (net.isIPv4(lookup)) {
        lookup = lookup.split('.').reverse().join('.');
    }
    else if (net.isIPv6(lookup)) {
        lookup = net_utils.ipv6_reverse(lookup);
    }

    if (this.enable_stats) {
        var start = new Date().getTime();
    }

    // Build the query, adding the root dot if missing
    var query = [lookup, zone].join('.');
    if (query[query.length - 1] !== '.') {
        query += '.';
    }
    this.logdebug('looking up: ' + query);
    // IS: IPv6 compatible (maybe; only if BL return IPv4 answers)
    dns.resolve(query, 'A', function (err, a) {
        self.stats_incr_zone(err, zone, start);  // Statistics

        // Check for a result of 127.0.0.1 or outside 127/8
        // This should *never* happen on a proper DNS list
        if (a && (a[0] === '127.0.0.1' || (a[0].split('.'))[0] !== '127')) {
            self.disable_zone(zone, a);
            return cb(err, null);  // Return a null A record
        }

        if (err) {
            if (err.code === dns.TIMEOUT) {         // list timed out
                self.disable_zone(zone, err.code); // disable it
            }
            if (err.code === dns.NOTFOUND) {  // unlisted
                return cb(null, a);          // not an error for a DNSBL
            }
        }
        return cb(err, a);
    });
};

exports.stats_incr_zone = function (err, zone, start) {
    var plugin = this;
    if (!plugin.enable_stats) return;

    var rkey = 'dns-list-stat:' + zone;
    var elapsed = new Date().getTime() - start;
    redis_client.hincrby(rkey, 'TOTAL', 1);
    var foo = (err) ? err.code : 'LISTED';
    redis_client.hincrby(rkey, foo, 1);
    redis_client.hget(rkey, 'AVG_RT', function (err2, rt) {
        if (err2) return;
        var avg = parseInt(rt) ? (parseInt(elapsed) + parseInt(rt))/2
                               : parseInt(elapsed);
        redis_client.hset(rkey, 'AVG_RT', avg);
    });
};

exports.init_redis = function () {
    if (redis_client) { return; }

    var redis = require('redis');
    var host_port = this.redis_host.split(':');
    var host = host_port[0] || '127.0.0.1';
    var port = parseInt(host_port[1], 10) || 6379;

    redis_client = redis.createClient(port, host);
    redis_client.on('error', function (err) {
        self.logerror('Redis error: ' + err);
        redis_client.quit();
        redis_client = null; // should force a reconnect
        // not sure if that's the right thing but better than nothing...
    });
};

exports.multi = function (lookup, zones, cb) {
    if (!lookup) return cb();
    if (!zones ) return cb();
    if (typeof zones === 'string') zones = [ '' + zones ];
    var self = this;
    var listed = [];

    var redis_incr = function (zone) {
        if (!self.enable_stats) return;

        // Statistics: check hit overlap
        for (var i=0; i < listed.length; i++) {
            var foo = (listed[i] === zone) ? 'TOTAL' : listed[i];
            redis_client.hincrby('dns-list-overlap:' + zone, foo, 1);
        }
    };

    function zoneIter (zone, done) {
        self.lookup(lookup, zone, function (err, a) {
            if (a) {
                listed.push(zone);
                redis_incr(zone);
            }
            cb(err, zone, a, true);
            done();
        });
    }
    function zonesDone (err) {
        cb(err, null, null, false);
    }
    async.each(zones, zoneIter, zonesDone);
};

// Return first positive or last result.
exports.first = function (lookup, zones, cb, cb_each) {
    if (!lookup || !zones) return cb();
    if (typeof zones === 'string') zones = [ '' + zones ];
    var ran_cb = false;
    this.multi(lookup, zones, function (err, zone, a, pending) {
        if (zone && cb_each && typeof cb_each === 'function') {
            cb_each(err, zone, a);
        }
        if (ran_cb) return;
        if (pending && (err || !a)) return;

        // has pending queries OR this one is a positive result
        ran_cb = true;
        return cb(err, zone, a);
    });
};

exports.check_zones = function (interval) {
    var self = this;
    this.disable_allowed = true;
    if (interval) interval = parseInt(interval);
    if ((this.zones && this.zones.length) ||
        (this.disabled_zones && this.disabled_zones.length)) {
        var zones = [];
        if (this.zones && this.zones.length) zones = zones.concat(this.zones);
        if (this.disabled_zones && this.disabled_zones.length) {
            zones = zones.concat(this.disabled_zones);
        }

        // A DNS list should never return positive or an error for this lookup
        // If it does, move it to the disabled list
        this.multi('127.0.0.1', zones, function (err, zone, a, pending) {
            if (!zone) return;

            if (a || (err && err.code === 'ETIMEOUT')) {
                return self.disable_zone(zone, ((a) ? a : err.code));
            }

            // Try the test point
            self.lookup('127.0.0.2', zone, function (err2, a2) {
                if (!a2) {
                    self.logwarn('zone \'' + zone +
                    '\' did not respond to test point (' + err2 + ')');
                    return self.disable_zone(zone, a2);
                }
                // Was this zone previously disabled?
                if (self.zones.indexOf(zone) === -1) {
                    self.loginfo('re-enabling zone ' + zone);
                    self.zones.push(zone);
                }
            });
        });
    }
    // Set a timer to re-test
    if (interval && interval >= 5 && !this._interval) {
        this.logdebug('will re-test list zones every ' + interval + ' minutes');
        this._interval = setInterval(function () {
            self.check_zones();
        }, (interval * 60) * 1000);
    }
};

exports.shutdown = function () {
    clearInterval(this._interval);
    if (redis_client) {
        redis_client.quit();
    }
};

exports.disable_zone = function (zone, result) {
    if (!zone) return false;
    if (!this.zones) return false;
    if (!this.zones.length) return false;
    if (!this.disable_allowed) return false;

    var idx = this.zones.indexOf(zone);
    if (idx === -1) return false;  // not enabled

    this.zones.splice(idx, 1);
    if (!(this.disabled_zones && this.disabled_zones.length)) {
        this.disabled_zones = [];
    }
    if (this.disabled_zones.indexOf(zone) === -1) {
        this.disabled_zones.push(zone);
    }
    this.logwarn('disabling zone \'' + zone + '\'' + (result ? ': ' +
        result : ''));
    return true;
};
