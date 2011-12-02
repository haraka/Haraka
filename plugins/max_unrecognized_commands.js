// Don't let the remote end spew us with unrecognized commands
// Defaults to 10 max unrecognized commands

exports.hook_connect = function(next, connection) {
    connection.notes.unrecognized_command_max = this.config.get('max_unrecognized_commands') || 10;
    connection.notes.unrecognized_command_count = 0;
    next();
};

exports.hook_unrecognized_command = function(next, connection, cmd) {
    connection.loginfo(this, "Unrecognized command: " + cmd);
    
    connection.notes.unrecognized_command_count++;
    if (connection.notes.unrecognized_command_count >= connection.notes.unrecognized_command_max) {
        connection.loginfo(this, "Closing connection. Too many bad commands.");
        return next(DENYDISCONNECT, "Too many bad commands");
    }
    next();
};
