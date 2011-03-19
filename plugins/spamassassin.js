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
//

var sock = require('./line_socket');

var defaults = {
    spamd_socket: 'localhost:783',
    max_size:     500000
};

exports.hook_data_post = function (callback, connection) {
    var config = this.config.get('spamassassin.ini', 'ini');
    
    for (var key in defaults) {
        config.main[key] = config.main[key] || defaults[key];
    }
    
    if (connection.transaction.data_bytes > config.main.max_size) {
        return callback(CONT);
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
        self.logerror("spamd connection timed out");
        socket.end();
        callback(CONT);
    });
    socket.on('error', function (err) {
        self.logerror("spamd connection failed: " + err);
        // we don't deny on error - maybe another plugin can deliver
        callback(CONT); 
    });
    socket.on('connect', function () {
        socket.write("SYMBOLS SPAMC/1.3\r\n", function () {
            socket.write("User: " + username + "\r\n\r\n", function () {
                socket.write("X-Envelope-From: " + 
                            connection.transaction.mail_from.replace(/</, '').replace(/>/, '')
                            + "\r\n", function ()
                {
                    send_data();
                });
            });
        });
    });
    
    var line0; // spamd greeting
    var spamd_response = {};
    
    socket.on('line', function (line) {
        if (!line0) {
            line0 = line;
        }
        else {
            var matches;
            if (matches = line.match(/Spam: (True|False) ; (-?\d+\.\d) \/ (-?\d+\.\d)/)) {
                spamd_response.flag = matches[1];
                spamd_response.hits = matches[2];
                spamd_response.reqd = matches[3];
            }
        }
    });
    
    socket.on('end', function () {
        if (config.main.reject_threshold && spamd_response.hits >= config.main.reject_threshold) {
            callback(DENY, "spam score exceeded threshold");
        }
        else if (config.main.munge_subject_threshold && spamd_response.hits >= config.main.munge_subject_threshold) {
            // munge the subject
        }
    });

};
