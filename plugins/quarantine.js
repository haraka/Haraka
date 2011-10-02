// quarantine

var path = require('path');
var fs = require('fs');

exports.register = function () {
    this.register_hook('queue','quarantine');
}

// http://unknownerror.net/2011-05/16260-nodejs-mkdirs-recursion-create-directory.html
var mkdirs = exports.mkdirs = function(dirpath, mode, callback) {
    path.exists(dirpath, function(exists) {
        if (exists) {
            callback(dirpath);
        } 
        else {
            mkdirs(path.dirname(dirpath), mode, function() {
                fs.mkdir(dirpath, mode, callback);
            });
        }
    });
}

var zeroPad = exports.zeroPad = function (n, digits) {
    n = n.toString();
    while (n.length < digits) {
        n = '0' + n;
    }
    return n;
}

exports.quarantine = function (next, connection) {
    var transaction = connection.transaction;
    if ((connection.notes.quarantine || transaction.notes.quarantine)) {
        var lines = transaction.data_lines;
        // Skip unless we have some data
        if (lines.length === 0) {
            return next();
        }
        // Calculate date in YYYYMMDD format
        var d = new Date();
        var yyyymmdd = d.getFullYear() + zeroPad(d.getMonth(), 2) 
            + this.zeroPad(d.getDate(), 2);
        var config = this.config.get('quarantine.ini', 'ini');
        var dir = (config.main.quarantine_path) ? config.main.quarantine_path :
                  '/var/spool/haraka/quarantine';
        // Allow either boolean or a sub-directory to be specified
        if (connection.notes.quarantine) {
            if (typeof(connection.notes.quarantine) !== 'boolean' &&
                connection.notes.quarantine !== 1)
            {
                dir += '/' + connection.notes.quarantine;
            }
        }
        else if (transaction.notes.quarantine) {
            if (typeof(transaction.notes.quarantine) !== 'boolean' &&
                transaction.notes.quarantine !== 1)
            {
                dir += '/' + transaction.notes.quarantine;
            }
        }
        dir += '/' + yyyymmdd;
        var plugin = this;
        mkdirs(dir, 0770, function () {
            fs.writeFile([dir, transaction.uuid].join('/'), lines.join(''), 
                function(err) {
                    if (err) {
                        plugin.logerror('Error writing quarantine file: ' + err);
                    }
                    else {
                        plugin.loginfo('Stored copy of message in quarantine: ' + 
                            [ dir, transaction.uuid ].join('/'));
                    }
                    return next();
                });
        });
    } 
    else {
        return next();
    }
}
