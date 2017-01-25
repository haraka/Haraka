// rate_limit
var ipaddr = require('ipaddr.js');

exports.register = function () {
    var plugin = this;
    plugin.inherits('redis');

    plugin.load_rate_limit_ini();

    plugin.register_hook('init_master',  'init_redis_plugin');
    plugin.register_hook('init_child',   'init_redis_plugin');

    plugin.register_hook('connect_init', 'incr_concurrency');
    plugin.register_hook('disconnect',   'decr_concurrency');
};

exports.load_rate_limit_ini = function () {
    var plugin = this;

    plugin.cfg = plugin.config.get('rate_limit.ini', function () {
        plugin.load_rate_limit_ini();
    });

    // legacy setting
    if (plugin.cfg.main.redis_server) {
        var match = /^([^: ]+)(?::(\d+))?$/.exec(plugin.cfg.main.redis_server);
        if (match) {
            plugin.cfg.redis.host = match[1];
            plugin.cfg.redis.port = match[2] || '6379';
        }
    }

    plugin.merge_redis_ini();
};

exports.shutdown = function () {
    if (this.db) this.db.quit();
}

exports.lookup_host_key = function (type, args, cb) {
    var remote_ip = args[0];
    var remote_host = args[1];
    if (!plugin.cfg[type]) {
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

    // Custom Default
    if (config[type].default) {
        return cb(null, ip, config[type].default);
    }
    // Default 0 = unlimited
    return cb(null, ip, 0);
};

exports.lookup_mail_key = function (type, args, cb) {
    var mail = args[0];
    if (!plugin.cfg[type] || !mail) {
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

    // Custom Default
    if (config[type].default) {
        return cb(null, email, config[type].default);
    }
    // Default 0 = unlimited
    return cb(null, email, 0);
};

exports.rate_limit = function (connection, key, value, cb) {
    var plugin = this;
    var limit;
    var ttl;
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

    connection.logdebug(plugin, 'key=' + key + ' limit=' + limit + ' ttl=' + ttl);

    plugin.db.get(key, function(err, val) {
        if (err) return cb(err);

        connection.logdebug(plugin, 'key=' + key + ' current value=' + (val || 'NEW' ));

        var check_limits = function(err2, result){
            if (err2) return cb(err2);

            if (parseInt(val) + 1 > parseInt(limit)) {
                // Limit breached
                connection.lognotice(plugin, key + ' rate ' + val + ' exceeds ' + limit + '/' + ttl + 's');
                return cb(null, true);
            }
            else {
                // OK
                return cb(null, false);
            }

        };

        if (val == null) { // new key
            plugin.db.setex(key, ttl, 1, check_limits);
        }
        else { // old key
            plugin.db.incr(key, check_limits);
        }
    });
};

// TODO: support this in Redis somehow
exports.incr_concurrency = function (next, connection) {
    var plugin = this;
    var config = this.config.get('rate_limit.ini');
    var snotes = connection.server.notes;

    var lookup_cb = function (err, key, value) {
        if (err) {
            connection.logerror(plugin, err);
            return next();
        }
        if (value === 0) {
            connection.logdebug(plugin, 'concurrency limit disabled for ' + key);
            return next();
        }
        if (!snotes.concurrency) snotes.concurrency = {};
        if (!snotes.concurrency[key]) snotes.concurrency[key] = 0;
        snotes.concurrency[key]++;
        connection.logdebug(plugin, '[concurrency] key=' + key + ' value=' +
                snotes.concurrency[key] + ' limit=' + value);
        var count = 0;
        var keys = Object.keys(snotes.concurrency);
        for (var i=0; i<keys.length; i++) {
            count += snotes.concurrency[keys[i]];
        }
        if (snotes.concurrency[key] > value) {
            if (plugin.cfg.main.tarpit_delay) {
                connection.notes.tarpit = plugin.cfg.main.tarpit_delay;
            }
            else {
                return next(DENYSOFT, 'connection concurrency limit exceeded (' + count +')');
            }
        }
        return next();
    };

    // Concurrency
    this.lookup_host_key('concurrency',
        [connection.remote.ip, connection.remote.host],
        lookup_cb);
};

exports.decr_concurrency = function (next, connection) {
    var plugin = this;
    var snotes = connection.server.notes;

    // Concurrency
    this.lookup_host_key('concurrency', [connection.remote.ip, connection.remote.host], function (err, key, value) {
        if (err) {
            connection.logerror(plugin, err);
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
        connection.loginfo(plugin, count + ' active connections to this child');
        return next();
    });
};

exports.hook_connect = function (next, connection) {
    var plugin = this;

    this.lookup_host_key('rate_conn', [connection.remote.ip, connection.remote.host], function (err, key, value) {
        if (err) {
            connection.logerror(plugin, err);
            return next();
        }
        // Check rate limit
        plugin.rate_limit(connection, 'rate_conn:' + key, value, function (err2, over) {
            if (err2) {
                connection.logerror(plugin, err2);
                return next();
            }
            if (over) {
                if (plugin.cfg.main.tarpit_delay) {
                    connection.notes.tarpit = plugin.cfg.main.tarpit_delay;
                }
                else {
                    return next(DENYSOFT, 'connection rate limit exceeded');
                }
            }
            // See if we need to tarpit rate_rcpt_host
            if (plugin.cfg.main.tarpit_delay) {
                plugin.lookup_host_key('rate_rcpt_host', [connection.remote.ip, connection.remote.host], function (err3, key2, value2) {
                    if (!err3 && key2 && value2) {
                        var match = /^(\d+)/.exec(value2);
                        var limit = match[0];
                        plugin.db.get('rate_rcpt_host:' + key2, function (err4, result) {
                            if (!err4 && result && limit) {
                                connection.logdebug(plugin, 'rate_rcpt_host:' + key2 + ' value2 ' + result + ' exceeds limit ' + limit);
                                if (result > limit) {
                                    connection.notes.tarpit = plugin.cfg.main.tarpit_delay;
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
};

exports.hook_rcpt = function (next, connection, params) {
    var plugin = this;
    var transaction = connection.transaction;

    var chain = [
        {
            name:           'rate_rcpt_host',
            lookup_func:    'lookup_host_key',
            lookup_args:    [connection.remote.ip, connection.remote.host],
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
        plugin[next_in_chain.lookup_func](next_in_chain.name, next_in_chain.lookup_args, function (err, key, value) {
            if (err) {
                connection.logerror(plugin, err);
                return chain_caller();
            }
            plugin.rate_limit(connection, next_in_chain.name + ':' + key, value, function (err2, over) {
                if (err2) {
                    connection.logerror(plugin, err2);
                    return chain_caller();
                }
                if (over) {
                    // Delay this response if we are not already tarpitting
                    if (plugin.cfg.main.tarpit_delay &&
                        !(connection.notes.tarpit || (transaction && transaction.notes.tarpit)))
                    {
                        connection.loginfo(plugin, 'tarpitting response for ' + plugin.cfg.main.tarpit + 's');
                        setTimeout(function () {
                            if (connection) {
                                return chain_caller(DENYSOFT, 'rate limit exceeded');
                            }
                        }, plugin.cfg.main.tarpit_delay*1000);
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
    };
    chain_caller();
};
