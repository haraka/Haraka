// Basic clamd plug-in
// Requires 'clamdscan' binary to function

var spawn = require('child_process').spawn;

var defaults = {
    clamdscan_bin: 'clamdscan',
    timeout: 30,
    only_with_attachments: 0,
};

exports.hook_data = function (next, connection) {
    var plugin = this;
    // Load config
    var config = this.config.get('clamdscan.ini', 'ini');
    for (var key in defaults) {
        config.main[key] = config.main[key] || defaults[key];
    }
    if (config.main['only_with_attachments']) {
        var transaction = connection.transaction;
        transaction.parse_body = 1;
        transaction.attachment_hooks(function (ctype, filename, body) {
            plugin.logdebug('Found ctype=' + ctype + ', filename=' + filename);
            transaction.notes.clamdscan_found_attachment = 1;
        });
    }
    return next();
}

exports.hook_data_post = function (next, connection) {
    var plugin = this;
    var transaction = connection.transaction;

    // Load config
    var config = this.config.get('clamdscan.ini', 'ini');
    for (var key in defaults) {
        config.main[key] = config.main[key] || defaults[key];
    }

    // Do we need to run?
    if (config.main['only_with_attachments'] &&
        !transaction.notes.clamdscan_found_attachment) 
    {
        plugin.logdebug('Skipping message as no attachments found');
        return next();
    }

    var virus_regexp = /^stream: (\S+) FOUND/;
    var virus_name;
    var clamdscan = spawn(config.main['clamdscan_bin'], 
                          ['-i', '--no-summary', '-']);
    plugin.logdebug('Spawned child pid: ' + clamdscan.pid);

    // Create a timeout
    var timeout = setTimeout(function () {
        plugin.logerror('timed out');
        clamdscan.kill();
    }, config.main['timeout'] * 1000);

    var data_marker = 0;
    var send_data = function() {
        if (data_marker < transaction.data_lines.length) {
            var line = transaction.data_lines[data_marker];
            plugin.logprotocol('wrote: ' + line);
            var wrote_all = clamdscan.stdin.write(line);
            data_marker++;
            if (wrote_all) { 
                send_data();
            }
        }
        else {
            clamdscan.stdin.end();
        }
    }

    clamdscan.stdin.on('error', function() {
        // Prevent EPIPE
        clamdscan.stdin.end();
    });

    clamdscan.stdin.on('drain', function() {
        plugin.logdebug('drain');
        send_data();
    });

    clamdscan.stdout.on('data', function(data) {
        plugin.logprotocol('received: ' + data);
        var m = virus_regexp.exec(data);
        if (m && m[1]) {
            virus_name = m[1];
        }
    });

    clamdscan.stderr.on('data', function(data) {
        if (/^execvp\(\)/.test(data)) {
            plugin.logerror('Failed to start child: ' + data);
            clamdscan.stdin.end();
        } 
        else {
            plugin.logdebug('stderr: ' + data);
        }
    });

    clamdscan.on('exit', function(code, signal) {
        clearTimeout(timeout);
        if (code) {
            plugin.logdebug('Child exited with code: ' + code);
            switch (code) {
                case 1:   // Virus found
                    return next(DENY, 'Message is infected with ' 
                                    + (virus_name || 'UNKNOWN'));
                    break;
                case 2:   // Error
                case 127: // No such file or directory
                    return next(DENYSOFT, 'Error running virus scanner');
                    break;
                default:
                    return next();
            }
        }
        if (signal) {
            plugin.logdebug('Child terminated by signal: ' + signal);
            if (signal === 'SIGTERM') {
                return next(DENYSOFT, 'Virus scanner timed out');
            }
        }
        return next();
    });

    send_data();
}
