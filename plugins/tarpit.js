// tarpit

var hooks_to_delay = ['connect', 'helo', 'ehlo', 'mail', 'rcpt', 'rcpt_ok', 'data',
   'data_post', 'queue', 'unrecognized_command', 'vrfy', 'noop', 'rset', 'quit'];

exports.register = function () {
    // Register tarpit function last
    var plugin = this;

    var cfg = plugin.config.get('tarpit.ini');
    if (cfg && cfg.main.hooks_to_delay) {
        hooks_to_delay = cfg.main.hooks_to_delay.split(/[\s,;]+/);
    }

    for (var i=0; i < hooks_to_delay.length; i++) {
        var hook = hooks_to_delay[i];
        plugin.register_hook(hook, 'tarpit');
    }
};

exports.tarpit = function (next, connection) {
    var plugin = this;
    if (!connection) return next();

    var conn_delay, trans_delay;
    if (connection.transaction) {
        trans_delay = connection.transaction.notes.tarpit;
    }
    if (connection) {
        conn_delay = connection.notes.tarpit;
    }

    var delay = trans_delay || conn_delay;
    if (!delay) return next();

    connection.loginfo(plugin, 'tarpitting response for ' + delay + 's');
    setTimeout(function () {
        if (connection) return next();
    },  delay * 1000);
};
