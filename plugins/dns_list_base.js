// DNS list module
var dns = require('dns');
var net = require('net');
var is_rfc1918 = require('./net_utils').is_rfc1918;

exports.enable_stats = false;
exports.disable_allowed = false;
exports.redis_host = '127.0.0.1:6379';
var redis_client;

exports.lookup = function (lookup, zone, cb) {
    var self = this;

    if (!lookup || !zone) {
        process.nextTick(function () {
            return cb(new Error("missing data"));
        });
    }

    if (this.enable_stats && !redis_client) {
        var redis = require('redis');
        var host_port = this.redis_host.split(':');
        if (!host_port[0]) host_port[0] = '127.0.0.1';
        if (!host_port[1]) {
            host_port[1] = 6379;
        }
        else {
            host_port[1] = parseInt(host_port[1], 10);
        }
        redis_client = redis.createClient(host_port[1], host_port[0]);
        redis_client.on('error', function (err) {
            self.logerror("Redis error: " + err);
            redis_client.quit();
            redis_client = null; // should force a reconnect - not sure if that's the right thing but better than nothing...
        });
    }

    // Reverse lookup if IPv4 address
    if (net.isIPv4(lookup)) {
        // Don't query private addresses
        if (is_rfc1918(lookup) && lookup.split('.')[0] !== '127') {
            this.logdebug('skipping private IP: ' + lookup);
            process.nextTick(function () {
                return cb(new Error("RFC 1918 private IP"));
            });
        }
        lookup = lookup.split('.').reverse().join('.');
    }
    // TODO: IPv6 not supported
    else if (net.isIPv6(lookup)) {
        process.nextTick(function () {
            return cb(new Error("IPv6 not supported"));
        });
    }

    if (this.enable_stats) {
        var start = (new Date).getTime();
    }

    // Build the query, adding the root dot if missing
    var query = [lookup, zone].join('.');
    if (query[query.length-1] !== '.') {
        query += '.';
    }
    this.logdebug('looking up: ' + query);
    dns.resolve(query, 'A', function (err, a) {
        // Statistics
        if (self.enable_stats) {
            var elapsed = (new Date).getTime() - start;
            redis_client.hincrby('dns-list-stat:' + zone, 'TOTAL', 1);
            (err) 
                ? redis_client.hincrby('dns-list-stat:' + zone, err.code, 1)
                : redis_client.hincrby('dns-list-stat:' + zone, 'LISTED', 1);
            redis_client.hget('dns-list-stat:' + zone, 'AVG_RT', function (err, rt) {
                if (!err)
                    redis_client.hset('dns-list-stat:' + zone, 'AVG_RT', 
                        (parseInt(rt) ? (parseInt(elapsed) + parseInt(rt))/2 : parseInt(elapsed)));
            });
        }
        // Check for a return of 127.0.0.1 or outside 127/8
        // This should *never* happen on a proper DNS list
        if (a && (a[0] === '127.0.0.1' || (a[0].split('.'))[0] !== '127')) {
            self.disable_zone(zone, a);
            // Return a null A record instead
            return cb(err, null);
        }
        // Disable list if it starts timing out
        if (err && err.code === 'ETIMEOUT') self.disable_zone(zone, err.code);
        if (err && err.code === 'ENOTFOUND') {
            return cb(null, a);  // Not an error for a DNSBL
        }
        return cb(err, a);
    });
};

exports.multi = function (lookup, zones, cb) {
    if (!lookup || !zones) return cb();
    if (typeof zones === 'string') zones = [ '' + zones ];
    var self = this;
    var listed = [];
    var pending = 0;
    zones.forEach(function (zone) {
        pending++;
        self.lookup(lookup, zone, function (err, a) {
            pending--;
            if (a) listed.push(zone);
            cb(err, zone, a, pending);
            // All queries completed?
            if (pending === 0) {
                // Statistics: check hit overlap
                if (self.enable_stats && listed.length > 0) {
                    listed.forEach(function (zone) {
                        for (var i=0; i < listed.length; i++) {
                            (listed[i] === zone)
                                ? redis_client.hincrby('dns-list-overlap:' + zone, 'TOTAL', 1)
                                : redis_client.hincrby('dns-list-overlap:' + zone, listed[i], 1);
                        }
                    });
                }
            }
        });
    });
}

// Return first positive or last result.
exports.first = function (lookup, zones, cb) {
    if (!lookup || !zones) return cb();
    if (typeof zones === 'string') zones = [ '' + zones ]; 
    var run_cb = 0;
    this.multi(lookup, zones, function (err, zone, a, pending) {
        if (!run_cb && ((!err && a) || pending === 0)) {
            run_cb++;
            return cb(err, zone, a);
        }
    });
}


exports.check_zones = function (interval) {
    var self = this;
    this.disable_allowed = true;
    if (interval) interval = parseInt(interval);
    if ((this.zones && this.zones.length) || (this.disabled_zones && this.disabled_zones.length)) {
        var zones = [];
        if (this.zones && this.zones.length) zones = zones.concat(this.zones);
        if (this.disabled_zones && this.disabled_zones.length) zones = zones.concat(this.disabled_zones);

        // A DNS list should never return positive or an error for this lookup
        // If it does we remove it from the zone list and do no further lookups
        this.multi('127.0.0.1', zones, function (err, zone, a, pending) {
            if (a || (err && err.code === 'ETIMEOUT')) {
                return self.disable_zone(zone, ((a) ? a : err.code));
            }
            // Try the test point
            self.lookup('127.0.0.2', zone, function (err, a) {
                if (!a) {
                    self.logwarn('zone \'' + zone + '\' did not respond to test point (' + err + ')');
                    return self.disable_zone(zone, a);
                }
                // Was this zone previously disabled?
                if (self.zones.indexOf(zone) === -1) {
                    self.loginfo('re-enabling zone ' + zone);
                    self.zones.push(zone);
                }
            });            
        });
    }
    // Set-up a timer to re-test
    if (interval && interval >= 5 && !this._interval) {
        this.logdebug('will re-test list zones every ' + interval + ' minutes');
        this._interval = setInterval(function () {
            self.check_zones();
        }, (interval * 60) * 1000);
    }
}

exports.disable_zone = function (zone, result) {
    if (zone && this.zones && this.zones.length && this.disable_allowed) {
        var idx = this.zones.indexOf(zone);
        if (idx !== -1) {
            this.zones.splice(idx, 1);
            if (!(this.disabled_zones && this.disabled_zones.length)) this.disabled_zones = [];
            if (this.disabled_zones.indexOf(zone) === -1) this.disabled_zones.push(zone);
            this.logwarn('disabling zone \'' + zone + '\'' + (result ? ': ' + result : ''));
        }
    }
}
