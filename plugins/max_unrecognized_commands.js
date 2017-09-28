// Don't let the remote end spew us with unrecognized commands
// Defaults to 10 max unrecognized commands

exports.hook_connect = function (next, connection) {
    const plugin = this;
    connection.results.add(plugin, {
        max: plugin.config.get('max_unrecognized_commands') || 10,
        count: 0,
    });
    return next();
};

exports.hook_unrecognized_command = function (next, connection, cmd) {
    const plugin = this;

    connection.results.add(plugin, {fail: "Unrecognized command: " + cmd, emit: true});
    connection.results.incr(plugin, {count: 1});

    const uc = connection.results.get('max_unrecognized_commands');
    if (uc.count >= uc.max) {
        connection.loginfo(plugin, "Closing connection. Too many bad commands.");
        return next(DENYDISCONNECT, "Too many bad commands");
    }
    return next();
};
