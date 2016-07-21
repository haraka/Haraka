'use strict';

exports.register = function () {
    var plugin = this;
    var NoSQL = require('haraka-nosql');

    plugin.load_limit_ini();

    var storage = 'ram';
    if (plugin.cfg.storage && plugin.cfg.storage.backend) {
        storage = plugin.cfg.storage.backend;
    }
    else {
        var isCluster = plugin.config.get('smtp.ini').main.nodes ? true : false;
        storage = isCluster ? 'ssc' : 'ram';
    }

    plugin.nosql = new NoSQL(plugin.name, {
        storage: storage,
        expire: plugin.cfg.concurrency.reset || 10,
    });

    if (plugin.cfg.concurrency) {
        plugin.register_hook('connect_init', 'incr_concurrency');
        plugin.register_hook('connect',      'check_concurrency');
        plugin.register_hook('disconnect',   'decr_concurrency');
    }

    if (plugin.cfg.errors) {
        ['helo','ehlo','mail','rcpt','data'].forEach(function (hook) {
            plugin.register_hook(hook, 'max_errors');
        });
    }

    if (plugin.cfg.recipients) {
        plugin.register_hook('rcpt', 'max_recipients');
    }

    if (plugin.cfg.unrecognized_commands) {
        plugin.register_hook('unrecognized_command',
            'max_unrecognized_commands');
    }
};

exports.load_limit_ini = function () {
    var plugin = this;
    plugin.cfg = plugin.config.get('limit.ini', function () {
        plugin.load_limit_ini();
    });

    if (!plugin.cfg.concurrency) {   // no config file
        plugin.cfg.concurrency = {};
    }
};

exports.max_unrecognized_commands = function(next, connection, cmd) {
    var plugin = this;
    if (!plugin.cfg.unrecognized_commands) { return next(); }

    connection.results.add(plugin, {fail: 'unrecognized: ' + cmd, emit: true});
    connection.results.incr(plugin, {unrec_cmds: 1});

    var max = parseFloat(plugin.cfg.unrecognized_commands.max);
    if (!max || isNaN(max)) { return next(); }

    var uc = connection.results.get('limit');
    if (parseFloat(uc.unrec_cmds) <= max) { return next(); }

    connection.results.add(plugin, {fail: 'unrec_cmds.max'});
    return next(DENYDISCONNECT, 'Too many unrecognized commands');
};

exports.max_errors = function (next, connection) {
    var plugin = this;
    if (!plugin.cfg.errors) { return next(); } // disabled in config

    var max = parseFloat(plugin.cfg.errors.max);
    if (!max || isNaN(max)) { return next(); }

    if (connection.errors <= max) { return next(); }

    connection.results.add(plugin, {fail: 'errors.max'});
    return next(DENYSOFTDISCONNECT, 'Too many errors');
};

exports.max_recipients = function (next, connection, params) {
    var plugin = this;
    if (!plugin.cfg.recipients) { return next(); } // disabled in config

    var max = plugin.get_recipient_limit(connection);
    if (!max) { return next(); }

    var c = connection.rcpt_count;
    var count = c.accept + c.tempfail + c.reject + 1;
    if (count <= max) { return next(); }

    connection.results.add(plugin, {fail: 'recipients.max'});
    return next(DENYSOFT, 'Too many recipients');
};

exports.get_recipient_limit = function (connection) {
    var plugin = this;

    if (connection.relaying && plugin.cfg.recipients.max_relaying) {
        return plugin.cfg.recipients.max_relaying;
    }

    var history_plugin = plugin.cfg.concurrency.history;
    if (!history_plugin) {
        return plugin.cfg.recipients.max;
    }

    var results = connection.results.get(history_plugin);
    if (!results) {
        connection.logerror(plugin, 'no ' + history_plugin + ' results,' +
               ' disabling history due to misconfiguration');
        delete plugin.cfg.recipients.history;
        return plugin.cfg.recipients.max;
    }

    if (results.history === undefined) {
        connection.logerror(plugin, 'no history from : ' + history_plugin);
        return plugin.cfg.recipients.max;
    }

    var history = parseFloat(results.history);
    connection.logdebug(plugin, 'history: ' + history);
    if (isNaN(history)) { history = 0; }

    if (history > 0) return plugin.cfg.recipients.history_good || 50;
    if (history < 0) return plugin.cfg.recipients.history_bad  || 2;
    return plugin.cfg.recipients.history_none || 15;
};

exports.incr_concurrency = function (next, connection) {
    var plugin = this;
    if (!plugin.cfg.concurrency) { return next(); }

    var dbkey = plugin.get_key(connection);

    plugin.nosql.incrby(dbkey, 1, function (err, concurrent) {

        if (concurrent === undefined) {
            connection.logerror(plugin, 'concurrency not returned by incrby!');
            return next();
        }

        connection.logdebug(plugin, 'concurrency incremented to ' + concurrent);

        // repair negative concurrency counters
        if (concurrent < 1) {
            connection.loginfo(plugin, 'resetting ' + concurrent + ' to 1');
            plugin.nosql.set(dbkey, 1);
        }

        connection.notes.limit=concurrent;
        next();
    });
};

exports.get_key = function (connection) {
    return 'concurrency|' + connection.remote.ip;
};

exports.check_concurrency = function (next, connection) {
    var plugin = this;

    var max = plugin.get_concurrency_limit(connection);
    if (!max) { return next(); }
    connection.logdebug(plugin, 'concurrent max: ' + max);

    var concurrent = parseInt(connection.notes.limit);

    if (concurrent <= max) {
        connection.results.add(plugin, { pass: concurrent + '/' + max});
        return next();
    }

    connection.results.add(plugin, {
        fail: 'concurrency: ' + concurrent + '/' + max,
    });

    var delay = 3;
    if (plugin.cfg.concurrency.disconnect_delay) {
        delay = parseFloat(plugin.cfg.concurrency.disconnect_delay);
    }

    // Disconnect slowly.
    setTimeout(function () {
        return next(DENYSOFTDISCONNECT, 'Too many concurrent connections');
    }, delay * 1000);
};

exports.get_concurrency_limit = function (connection) {
    var plugin = this;

    var history_plugin = plugin.cfg.concurrency.history;
    if (!history_plugin) {
        return plugin.cfg.concurrency.max;
    }

    var results = connection.results.get(history_plugin);
    if (!results) {
        connection.logerror(plugin, 'no ' + history_plugin + ' results,' +
               ' disabling history due to misconfiguration');
        delete plugin.cfg.concurrency.history;
        return plugin.cfg.concurrency.max;
    }

    if (results.history === undefined) {
        connection.loginfo(plugin, 'no IP history from : ' + history_plugin);
        return plugin.cfg.concurrency.max;
    }

    var history = parseFloat(results.history);
    connection.logdebug(plugin, 'history: ' + history);
    if (isNaN(history)) { history = 0; }

    if (history < 0) { return plugin.cfg.concurrency.history_bad  || 1; }
    if (history > 0) { return plugin.cfg.concurrency.history_good || 5; }
    return plugin.cfg.concurrency.history_none || 3;
};

exports.decr_concurrency = function (next, connection) {
    var plugin = this;
    if (!plugin.cfg.concurrency) { return next(); }

    var dbkey = plugin.get_key(connection);
    plugin.nosql.incrby(dbkey, -1, function (err, concurrent) {
        connection.logdebug(plugin, 'decrement concurrency to ' + concurrent);

        // if connections didn't increment properly, the counter can go
        // negative. check for and repair negative concurrency counters
        if (concurrent < 0) {
            connection.loginfo(plugin, 'resetting ' + concurrent + ' to 1');
            plugin.nosql.set(dbkey, 1);
        }

        return next();
    });
};
