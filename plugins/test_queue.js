
var smtp = require('../constants');
var fs   = require('fs');

exports.hook_queue = function(callback, connection) {
    var lines = connection.transaction.data_lines;
    if (lines.length === 0) {
        return callback(smtp.deny);
    }
    
    fs.writeFile('/tmp/mail.eml', lines.join(''), function(err) {
        if (err) {
            return callback(smtp.deny, "Saving failed");
        }
        
        return callback(smtp.ok);
    });
};
