// Don't let the remote end spew us with unrecognized commands
// Defaults to 10 max unrecognized commands

exports.hook_connect = function(callback, connection) {
    connection.notes.unrecognized_command_max = this.config.get('max_unrecognized_commands') || 10;
    connection.notes.unrecognized_command_count = 0;
    callback(CONT);
};

exports.hook_unrecognized_command = function(callback, connection, cmd) {
    this.loginfo("Unrecognized command: " + cmd);
    
    connection.notes.unrecognized_command_count++;
    if (connection.notes.unrecognized_command_count >= connection.notes.unrecognized_command_max) {
        this.loginfo("Closing connection. Too many bad commands.");
        return callback(DENYDISCONNECT, "Too many bad commands");
    }
    callback(CONT);
};
