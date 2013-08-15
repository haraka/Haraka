// quarantine

var path = require('path');
var fs = require('fs');

var existsSync = require('./utils').existsSync;

exports.register = function () {
    this.register_hook('queue','quarantine');
    this.register_hook('queue_outbound','quarantine');
}

// http://unknownerror.net/2011-05/16260-nodejs-mkdirs-recursion-create-directory.html
var mkdirs = exports.mkdirs = function(dirpath, mode, callback) {
    if (existsSync(dirpath)) {
        return callback(dirpath);
    }
    mkdirs(path.dirname(dirpath), mode, function() {
        fs.mkdir(dirpath, mode, callback);
    });
}

var zeroPad = exports.zeroPad = function (n, digits) {
    n = n.toString();
    while (n.length < digits) {
        n = '0' + n;
    }
    return n;
}

exports.hook_init_master = function (next) {
    // At start-up; delete any files in the temporary directory
    // NOTE: This is deliberately syncronous to ensure that this
    //       is completed prior to any messages being received.
    var config = this.config.get('quarantine.ini');
    var base_dir = (config.main.quarantine_path) ?
                    config.main.quarantine_path  :
                    '/var/spool/haraka/quarantine';
    var tmp_dir = [ base_dir, 'tmp' ].join('/');
    if (existsSync(tmp_dir)) {
        var dirent = fs.readdirSync(tmp_dir);
        this.loginfo('Removing temporary files from: ' + tmp_dir);
        for (var i=0; i<dirent.length; i++) {
            fs.unlinkSync([ tmp_dir, dirent[i] ].join('/'));
        }
    }
    return next();
}

exports.quarantine = function (next, connection) {
    var transaction = connection.transaction;
    if ((connection.notes.quarantine || transaction.notes.quarantine)) {
        // Calculate date in YYYYMMDD format
        var d = new Date();
        var yyyymmdd = d.getFullYear() + zeroPad(d.getMonth()+1, 2) 
            + this.zeroPad(d.getDate(), 2);
        var config = this.config.get('quarantine.ini');
        var base_dir = (config.main.quarantine_path) ? 
                        config.main.quarantine_path  :
                        '/var/spool/haraka/quarantine';
        var dir;
        // Allow either boolean or a sub-directory to be specified
        if (connection.notes.quarantine) {
            if (typeof(connection.notes.quarantine) !== 'boolean' &&
                connection.notes.quarantine !== 1)
            {
                dir = connection.notes.quarantine;
            }
        }
        else if (transaction.notes.quarantine) {
            if (typeof(transaction.notes.quarantine) !== 'boolean' &&
                transaction.notes.quarantine !== 1)
            {
                dir = transaction.notes.quarantine;
            }
        }
        if (!dir) {
            dir = yyyymmdd;
        } else {
            dir = [ dir, yyyymmdd ].join('/');
        }
        var plugin = this;
        // Create all the directories recursively if they do not exist first.
        // Then write the file to a temporary directory first, once this is 
        // successful we hardlink the file to the final destination and then 
        // remove the temporary file to guarantee a complete file in the 
        // final destination.
        mkdirs([ base_dir, 'tmp' ].join('/'), parseInt('0770', 8), function () {
            mkdirs([ base_dir, dir ].join('/'), parseInt('0770', 8), function () {
                var ws = fs.createWriteStream([ base_dir, 'tmp', transaction.uuid ].join('/'));
                ws.on('error', function (err) {
                    connection.logerror(plugin, 'Error writing quarantine file: ' + err.message);
                    return next();
                });
                ws.on('close', function () {
                    fs.link([ base_dir, 'tmp', transaction.uuid ].join('/'), 
                            [ base_dir, dir, transaction.uuid ].join('/'),
                            function (err) {
                                if (err) {
                                    connection.logerror(plugin, 'Error writing quarantine file: ' + err);
                                }
                                else {
                                    // Add a note to where we stored the message
                                    transaction.notes.quarantined = [ base_dir, dir, transaction.uuid ].join('/');
                                    connection.loginfo(plugin, 'Stored copy of message in quarantine: ' + 
                                                   [ base_dir, dir, transaction.uuid ].join('/'));
                                    // Now delete the temporary file
                                    fs.unlink([ base_dir, 'tmp', transaction.uuid ].join('/'), function () {});
                                }
                                // Using notes.quarantine_action to decide what to do after the message is quarantined.
                                // Format can be either action = [ code, msg ] or action = code 
                                var action = (connection.notes.quarantine_action || transaction.notes.quarantine_action); 
                                if (Array.isArray(action)) {
                                    return next(action[0], action[1]);
                                }
                                else if (action) {
                                    return next(action);
                                }
                                else {
                                    return next();
                                }
                            }
                    );
                });
                transaction.message_stream.pipe(ws, { line_endings: '\n' });
            });
        });
        
    } 
    else {
        return next();
    }
}
