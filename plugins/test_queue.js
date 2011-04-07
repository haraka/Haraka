
var fs   = require('fs');

exports.hook_queue = function(next, connection) {
    var lines = connection.transaction.data_lines;
    if (lines.length === 0) {
        return next(DENY);
    }
    
    fs.writeFile('/tmp/mail.eml', lines.join(''), function(err) {
        if (err) {
            return next(DENY, "Saving failed");
        }
        
        return next(OK);
    });
};
