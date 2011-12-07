// Call spamassassin via spamd

// Config is in spamassassin.ini
// Valid keys:
//   reject_threshold=N - score at which to reject the mail
//                        Default: don't reject mail
//   munge_subject_threshold=N - score at which to munge the subject
//                        Default: don't munge the subject
//   subject_prefix=str - prefix to use when munging the subject.
//                        Default: *** SPAM ***
//   spamd_socket=[/path|host:port]
//                      - Default: localhost:783
//   spamd_user=str     - username to pass to spamd
//                        Default: same as current user
//   max_size=N         - don't scan mails bigger than this
//                        Default: 500000
//   old_headers_action=[rename|drop|keep]
//                      - if old X-Spam-* headers are in the email, what do
//                        we do with them? Default is to rename them
//                        X-Old-Spam-*. "drop" will delete them. "keep" will
//                        keep them (new X-Spam-* headers appear lower down
//                        in the headers then).
//

var sock = require('./line_socket');

var defaults = {
    spamd_socket: 'localhost:783',
    max_size:     500000,
    old_headers_action: "rename",
    subject_prefix: "*** SPAM ***",
};

exports.hook_data_post = function (next, connection) {
    var config = this.config.get('spamassassin.ini');
    var plugin = this;
    
    for (var key in defaults) {
        config.main[key] = config.main[key] || defaults[key];
    }
    
    ['reject_threshold', 'munge_subject_threshold', 'max_size'].forEach(
        function (item) {
            if (config.main[item]) {
                config.main[item] = new Number(config.main[item]);
            }
        }
    );
    
    if (connection.transaction.data_bytes > config.main.max_size) {
        return next();
    }
    
    var socket = new sock.Socket();
    if (config.main.spamd_socket.match(/\//)) {
        // assume unix socket
        socket.connect(config.main.spamd_socket);
    }
    else {
        var hostport = config.main.spamd_socket.split(/:/);
        socket.connect(hostport[1], hostport[0]);
    }
    
    socket.setTimeout(300 * 1000);
    
    var username = config.main.spamd_user || process.getuid();
    
    var data_marker = 0;
    
    var send_data = function () {
        if (data_marker < connection.transaction.data_lines.length) {
            var wrote_all = socket.write(connection.transaction.data_lines[data_marker]);
            data_marker++;
            if (wrote_all) {
                send_data();
            }
        }
        else {
            socket.end("\r\n");
        }
    };

    socket.on('timeout', function () {
        connection.logerror(plugin, "spamd connection timed out");
        socket.end();
        next();
    });
    socket.on('error', function (err) {
        connection.logerror(plugin, "spamd connection failed: " + err);
        // we don't deny on error - maybe another plugin can deliver
        next(); 
    });
    socket.on('connect', function () {
        socket.write("SYMBOLS SPAMC/1.3\r\n", function () {
            socket.write("User: " + username + "\r\n\r\n", function () {
                socket.write("X-Envelope-From: " + 
                            connection.transaction.mail_from.address()
                            + "\r\n", function ()
                {
                    send_data();
                });
            });
        });
    });
    
    var spamd_response = {};
    var state = 'line0';
    
    socket.on('line', function (line) {
        connection.logprotocol(plugin, "Spamd C: " + line);
        line = line.replace(/\r?\n/, '');
        if (state === 'line0') {
            spamd_response.line0 = line;
            state = 'response';
        }
        else if (state === 'response') {
            if (line.match(/\S/)) {
                var matches;
                if (matches = line.match(/Spam: (True|False) ; (-?\d+\.\d) \/ (-?\d+\.\d)/)) {
                    spamd_response.flag = matches[1];
                    spamd_response.hits = matches[2];
                    spamd_response.reqd = matches[3];
                    spamd_response.flag = spamd_response.flag === 'True' ? 'Yes' : 'No'
                }
            }
            else {
                state = 'tests';
            }
        }
        else if (state === 'tests') {
            spamd_response.tests = line;
            socket.destroy();
        }
    });
    
    socket.on('end', function () {
        // Now we do stuff with the results...
        
        plugin.fixup_old_headers(config.main.old_headers_action, connection.transaction);

        if (spamd_response.flag === 'Yes') {
            connection.transaction.add_header('X-Spam-Flag', 'YES');
        }
        connection.transaction.add_header('X-Spam-Status', spamd_response.flag +
            ', hits=' + spamd_response.hits + ' required=' + spamd_response.reqd +
            "\n\ttests=" + spamd_response.tests);
        
        var stars = Math.floor(spamd_response.hits);
        if (stars < 1) stars = 1;
        if (stars > 50) stars = 50;
        var stars_string = '';
        for (var i = 0; i < stars; i++) {
            stars_string += '*';
        }
        connection.transaction.add_header('X-Spam-Level', stars_string);
        
        connection.loginfo(plugin, "spamassassin returned: " + spamd_response.flag + ', ' +
            spamd_response.hits + '/' + spamd_response.reqd +
            " Reject at: " + config.main.reject_threshold);
        
        if (config.main.reject_threshold && (spamd_response.hits >= config.main.reject_threshold)) {
            return next(DENY, "spam score exceeded threshold");
        }
        else if (config.main.munge_subject_threshold && (spamd_response.hits >= config.main.munge_subject_threshold)) {
            var subj = connection.transaction.header.get('Subject');
            connection.transaction.remove_header('Subject');
            connection.transaction.add_header('Subject', config.main.subject_prefix + " " + subj);
        }
        next();
    });

};

exports.fixup_old_headers = function (action, transaction) {
    var headers = ['X-Spam-Flag', 'X-Spam-Status', 'X-Spam-Level'];

    switch (action) {
        case "keep": return;
        case "drop": for (var key in headers) { transaction.remove_header(key) }
                     break;
        case "rename":
        default:
                     for (var key in headers) {
                         var old_val = transaction.header.get(key);
                         if (old_val) {
                             transaction.header.remove_header(key);
                             transaction.header.add_header(key.replace(/X-/, 'X-Old-'), old_val);
                         }
                     }
                     break;
    }
}
