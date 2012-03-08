// rate_limit
var ipaddr = require('ipaddr.js');
var redis = require('redis');
var client;

exports.register = function () {
    var config = this.config.get('rate_limit.ini');
    if (config.main.redis_server) {
        // No support for IPv6 in Redis yet...
        // TODO: make this regex support IPv6 when it does.
        var match = /^([^: ]+)(?::(\d+))?$/.exec(config.main.redis_server);
        if (match) {
            var host = match[1];
            var port = match[2] || '6379';
            this.logdebug('using redis on ' + host + ':' + port);
            client = redis.createClient(port, host);
        }
        else {
            // Syntax error
            throw new Error('syntax error');
        }
    }
    else {
        // Client default is 127.0.0.1:6379
        client = redis.createClient();
    }
    this.register_hook('connect', 'incr_concurrency');
    this.register_hook('disconnect', 'decr_concurrency');
}

exports.lookup_host_key = function (type, args, cb) {
    var remote_ip = args[0];
    var remote_host = args[1];
    var config = this.config.get('rate_limit.ini');
    if (!config[type]) {  
        return cb(new Error(type + ': not configured'));
    }
    var ip;
    var ip_type;
    try {
        ip = ipaddr.parse(remote_ip);
        ip_type = ip.kind();
        if (ip_type === 'ipv6') {
            ip = ipaddr.toNormalizedString();
        }
        else {
            ip = ip.toString();
        }
    }
    catch (err) {
        return cb(err);
    }

    var ip_array = ((ip_type === 'ipv6') ? ip.split(':') : ip.split('.'));
    while (ip_array.length) {
        var part = ((ip_type === 'ipv6') ? ip_array.join(':') : ip_array.join('.'));
        if (config[type][part] || config[type][part] === 0) {
            return cb(null, part, config[type][part]);
        }
        ip_array.pop();
    }

    // rDNS
    if (remote_host) {
        var rdns_array = remote_host.toLowerCase().split('.');
        while (rdns_array.length) {
            var part = rdns_array.join('.');
            if (config[type][part] || config[type][part] === 0) {
                return cb(null, part, config[type][part]);
            }
            rdns_array.pop();
        }
    }

    // Default
    if (config[type].default) {
        return cb(null, ip, config[type].default);
    }
}

exports.lookup_mail_key = function (type, args, cb) {
    var mail = args[0];
    var config = this.config.get('rate_limit.ini');
    if (!config[type] || !mail) {
        return cb();
    }

    // Full e-mail address (e.g. smf@fsl.com)
    var email = mail.address();
    if (config[type][email] || config[type][email] === 0) {
        return cb(null, email, config[type][email]);
    }

    // RHS parts e.g. host.sub.sub.domain.com
    if (mail.host) {
        var rhs_split = mail.host.toLowerCase().split('.');
        while (rhs_split.length) {
            var part = rhs_split.join('.');
            if (config[type][part] || config[type][part] === 0) {
                return cb(null, part, config[type][part]);
            }   
            rhs_split.pop();
        }
    }

    // Default
    if (config[type].default) {
        return cb(null, email, config[type].default);
    }
}

exports.rate_limit = function (connection, key, value, cb) {
    var self = this;
    var limit, ttl;
    if (!key || !value) return cb();
    if (value === 0) {
        // Limit disabled for this host
        connection.loginfo(this, 'rate limit disabled for: ' + key);
        return cb(null, false);
    }
    var match = /^(\d+)(?:\/(\d+)(\S)?)?$/.exec(value);
    if (match) {
        limit = match[1];
        ttl = ((match[2]) ? match[2] : 60);  // Default 60s
        if (match[3]) {
            // Unit
            switch (match[3].toLowerCase()) {
                case 's':
                        // Default is seconds
                        break; 
                case 'm':   
                        ttl *= 60;
                        break;
                case 'h':   
                        ttl *= (60*60);
                        break;
                case 'd':   
                        ttl *= (60*60*24);
                        break;
                default:
                    // Unknown time unit
                    return cb(new Error('unknown time unit \'' + match[3] + '\' key=' + key));
            }
        }
    }
    else {
        // Syntax error
        return cb(new Error('syntax error: key=' + key + ' value=' + value));
    }

    connection.logdebug(self, 'key=' + key + ' limit=' + limit + ' ttl=' + ttl);

    client.incr(key, function(err, val) {
        if (err) return cb(err);
        connection.logdebug(self, 'key=' + key + ' value=' + val);
        if (parseInt(val) === 1) {
            // New key; set ttl
            client.expire(key, ttl, function (err, result) {
                if (err) {
                    connection.logerror(self, err);
                }
            });
        }
        if (parseInt(val) > parseInt(limit)) {
            // Limit breached
            connection.lognotice(self, key + ' rate ' + val + ' exceeds ' + limit + '/' + ttl + 's');
            return cb(null, true);
        } 
        else {
            // OK
            return cb(null, false);
        }
    });
}

// TODO: support this in Redis somehow
exports.incr_concurrency = function (next, connection) {
    var self = this;
    var config = this.config.get('rate_limit.ini');
    var snotes = connection.server.notes;

    // Concurrency 
    this.lookup_host_key('concurrency', [connection.remote_ip, connection.remote_host], function (err, key, value) {
        if (err) {
            connection.logerror(self, err);
            return next();
        }
        if (value === 0) {
            connection.logdebug(self, 'concurrency limit disabled for ' + key);
            return next();
        }
        if (!snotes.concurrency) snotes.concurrency = {};
        if (!snotes.concurrency[key]) snotes.concurrency[key] = 0;
        snotes.concurrency[key]++;
        connection.logdebug(self, '[concurrency] key=' + key + ' value=' + snotes.concurrency[key] + ' limit=' + value);
        var count = 0;
        var keys = Object.keys(snotes.concurrency);
        for (var i=0; i<keys.length; i++) {
            count += snotes.concurrency[keys[i]];
        }
        if (snotes.concurrency[key] > value) {
            if (config.main.tarpit_delay) {
                connection.notes.tarpit = config.main.tarpit_delay;
            }
            else {
                return next(DENYSOFT, 'connection concurrency limit exceeded');
            }
        }
        return next();
    });
}

exports.decr_concurrency = function (next, connection) {
    var self = this;
    var snotes = connection.server.notes;

    // Concurrency
    this.lookup_host_key('concurrency', [connection.remote_ip, connection.remote_host], function (err, key, value) {
        if (err) {
            connection.logerror(self, err);
            return next();
        }
        if (!snotes.concurrency) snotes.concurrency = {};
        if (!snotes.concurrency[key]) snotes.concurrency[key] = 0;
        if (snotes.concurrency[key] !== 0) snotes.concurrency[key]--;
        if (snotes.concurrency[key] === 0) delete snotes.concurrency[key];
        var count = 0;
        var keys = Object.keys(snotes.concurrency);
        for (var i=0; i<keys.length; i++) {
            count += snotes.concurrency[keys[i]];
        }
        connection.loginfo(self, count + ' active connections to this child');
        return next();
    });
}

exports.hook_connect = function (next, connection) {
    var self = this;
    var config = this.config.get('rate_limit.ini');

    this.lookup_host_key('rate_conn', [connection.remote_ip, connection.remote_host], function (err, key, value) {
        if (err) {
            connection.logerror(self, err);
            return next();
        }
        // Check rate limit
        self.rate_limit(connection, 'rate_conn:' + key, value, function (err, over) {
            if (err) {
                connection.logerror(self, err);
                return next();
            }
            if (over) {
                if (config.main.tarpit_delay) {
                    connection.notes.tarpit = config.main.tarpit_delay;
                }
                else {
                    return next(DENYSOFT, 'connection rate limit exceeded');
                }
            }
            // See if we need to tarpit rate_rcpt_host
            if (config.main.tarpit_delay) {
                self.lookup_host_key('rate_rcpt_host', [connection.remote_ip, connection.remote_host], function (err, key, value) {
                    if (!err && key && value) {
                        var match = /^(\d+)/.exec(value);
                        var limit = match[0];
                        client.get('rate_rcpt_host:' + key, function (err, result) {
                            if (!err && result && limit) {
                                connection.logdebug(self, 'rate_rcpt_host:' + key + ' value ' + result + ' exceeds limit ' + limit);
                                if (result > limit) {
                                    connection.notes.tarpit = config.main.tarpit_delay;
                                }
                            }
                            return next();
                        });
                    }
                    else {
                        return next();
                    }
                });
            } 
            else {
                return next();
            }
        }); 
    });
}

exports.hook_rcpt = function (next, connection, params) {
    var self = this;
    var config = this.config.get('rate_limit.ini');
    var transaction = connection.transaction;

    var chain = [
        {
            name:           'rate_rcpt_host',
            lookup_func:    'lookup_host_key',
            lookup_args:    [connection.remote_ip, connection.remote_host], 
        },
        {
            name:           'rate_rcpt_sender',
            lookup_func:    'lookup_mail_key',
            lookup_args:    [connection.transaction.mail_from],
        },
        {
            name:           'rate_rcpt_null',
            lookup_func:    'lookup_mail_key',
            lookup_args:    [params[0]],
            check_func:     function () {
                if (transaction && !transaction.mail_from.user) {
                    // Message from the null sender
                    return true;
                }
                return false;
            },
        },
        {
            name:           'rate_rcpt',
            lookup_func:    'lookup_mail_key',
            lookup_args:    [params[0]],
        },
    ];

    var chain_caller = function (code, msg) {
        if (code) {
            return next(code, msg);
        }
        if (!chain.length) {
            return next();
        }
        var next_in_chain = chain.shift();
        // Run any check functions
        if (next_in_chain.check_func && typeof next_in_chain.check_func === 'function') {
            if (!next_in_chain.check_func()) {
                return chain_caller();
            }
        }
        self[next_in_chain.lookup_func](next_in_chain.name, next_in_chain.lookup_args, function (err, key, value) {
            if (err) {
                connection.logerror(self, err);
                return chain_caller();
            }
            self.rate_limit(connection, next_in_chain.name + ':' + key, value, function (err, over) {
                if (err) {
                    connection.logerror(self, err);
                    return chain_caller();
                }
                if (over) {
                    // Delay this response if we are not already tarpitting
                    if (config.main.tarpit_delay && 
                        !(connection.notes.tarpit || (transaction && transaction.notes.tarpit))) 
                    {
                        connection.loginfo(self, 'tarpitting response for ' + config.main.tarpit + 's');
                        setTimeout(function () {
                            if (connection) {
                                return chain_caller(DENYSOFT, 'rate limit exceeded');
                            }
                        }, config.main.tarpit_delay*1000);
                    }
                    else {
                        return chain_caller(DENYSOFT, 'rate limit exceeded')
                    }
                }
                else {
                    return chain_caller();
                }
            });
        });
    }
    chain_caller();
}
