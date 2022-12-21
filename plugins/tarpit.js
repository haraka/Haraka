// tarpit

let hooks_to_delay = [
    'connect', 'helo', 'ehlo', 'mail', 'rcpt', 'rcpt_ok',
    'data', 'data_post', 'queue', 'unrecognized_command', 'vrfy', 'noop',
    'rset', 'quit'
];

exports.register = function () {
    // Register tarpit function last

    const cfg = this.config.get('tarpit.ini');
    if (cfg?.main.hooks_to_delay) {
        hooks_to_delay = cfg.main.hooks_to_delay.split(/[\s,;]+/);
    }

    for (const hook of hooks_to_delay) {
        this.register_hook(hook, 'tarpit');
    }
}

exports.tarpit = function (next, connection) {
    const { transaction } = connection;
    if (!transaction) return next();

    let delay = connection.notes.tarpit;

    if (!delay) delay = transaction.notes.tarpit;

    if (!delay) return next();

    connection.loginfo(this, `tarpitting response for ${delay}s`);
    setTimeout(() => next(),  delay * 1000);
}
