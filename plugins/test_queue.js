
var fs   = require('fs');

exports.hook_queue = function(callback, connection) {
    var lines = connection.transaction.data_lines;
    if (lines.length === 0) {
        return callback(DENY);
    }
    
    fs.writeFile('/tmp/mail.eml', lines.join(''), function(err) {
        if (err) {
            return callback(DENY, "Saving failed");
        }
        
        return callback(OK);
    });
};
