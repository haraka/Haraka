
var logger    = require('../logger');
var constants = require('../constants');
var fs        = require('fs');

exports.register = function() {
    this.register_hook('queue', 'queue_mail');
};

exports.queue_mail = function(callback, connection) {
    var lines = connection.transaction.data_lines;
    if (lines.length === 0) {
        return callback(constants.deny);
    }
    
    fs.writeFile('/tmp/mail.eml', lines.join(''), function(err) {
        if (err) {
            return callback(constants.deny, "Saving failed");
        }
        
        return callback(constants.ok);
    });
};
