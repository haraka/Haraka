// Call spamassassin via spamd

var sock = require('./line_socket');

var defaults = {
    spamd_socket: 'localhost:783',
    max_size:     500000,
    old_headers_action: "rename",
    subject_prefix: "*** SPAM ***",
};

exports.hook_data_post = function (next, connection) {
    var plugin = this;
    var config = this.config.get('spamassassin.ini');

    setupDefaults(config);

    if (msgTooBig(config, connection, plugin)) return next();

    var socket   = getSpamdSocket(config, next, connection, plugin);
    var username = getSpamdUsername(config, connection);
    var headers  = getSpamdHeaders(connection, username);

    socket.on('connect', function () {
        socket.write(headers.join("\r\n"));
        connection.transaction.message_stream.pipe(socket);
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
            socket.end();
        }
    });

    socket.on('end', function () {
        // Abort if the connection or transaction are gone
        if (!connection || (connection && !connection.transaction)) return next();

        // do stuff with the results...
        connection.transaction.notes.spamassassin = spamd_response;

        plugin.fixup_old_headers(config.main.old_headers_action, connection.transaction);
        doHeaderUpdates(connection, spamd_response);
        logResults(connection, plugin, spamd_response, config);

        var hits = spamd_response.hits;
        var rmax = config.main.relay_reject_threshold;
        if (connection.relaying && rmax && (hits >= rmax)) {
            return next(DENY, "spam score exceeded relay threshold");
        };

        var max = config.main.reject_threshold;
        if (max && (hits >= max)) {
            return next(DENY, "spam score exceeded threshold");
        }

        var munge = config.main.munge_subject_threshold;
        if (munge && (hits >= munge)) {
            var subj = connection.transaction.header.get('Subject');
            // Try and prevent double subject modifications
            var subject_re = new RegExp('^' + config.main.subject_prefix);
            if (!subject_re.test(subj)) {
                connection.transaction.remove_header('Subject');
                connection.transaction.add_header('Subject', config.main.subject_prefix + " " + subj);
            }
        }
        return next();
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

function setupDefaults(config) {
    for (var key in defaults) {
        config.main[key] = config.main[key] || defaults[key];
    }

    ['reject_threshold', 'relay_reject_threshold',
     'munge_subject_threshold', 'max_size'].forEach(
        function (item) {
            if (config.main[item]) {
                config.main[item] = new Number(config.main[item]);
            }
        }
    );
};

function doHeaderUpdates(connection, spamd_response) {

    if (spamd_response.flag === 'Yes') {
        connection.transaction.add_header('X-Spam-Flag', 'YES');
        connection.transaction.remove_header('precedence');
        connection.transaction.add_header('Precedence', 'junk');
    }

    connection.transaction.add_header('X-Spam-Status',
        spamd_response.flag
        + ', hits=' + spamd_response.hits
        + ' required=' + spamd_response.reqd
        + "\n\ttests=" + spamd_response.tests);

    var stars = Math.floor(spamd_response.hits);
    if (stars < 1) stars = 1;
    if (stars > 50) stars = 50;
    var stars_string = '';
    for (var i = 0; i < stars; i++) {
        stars_string += '*';
    }
    connection.transaction.add_header('X-Spam-Level', stars_string);
};

function getSpamdHeaders(connection, username) {
    var headers = [
        'SYMBOLS SPAMC/1.3',
        'User: ' + username,
        '',
        'X-Envelope-From: ' + connection.transaction.mail_from.address(),
        'X-Haraka-UUID: ' + connection.transaction.uuid,
    ];
    if (connection.relaying) {
        headers.push('X-Haraka-Relay: true');
    }
    return headers;
};

function getSpamdUsername(config, connection) {
     var user = config.main.spamd_user ||
               connection.transaction.notes.spamd_user ||
              'default';

    if ( user === 'vpopmail' ) {
        // allow per-user SA prefs to work
        return connection.transaction.rcpt_to[0].address;
    };
    return user;
};

function getSpamdSocket(config, next, connection, plugin) {
    var socket = new sock.Socket();
    if (config.main.spamd_socket.match(/\//)) {    // assume unix socket
        socket.connect(config.main.spamd_socket);
    }
    else {
        var hostport = config.main.spamd_socket.split(/:/);
        socket.connect((hostport[1] || 783), hostport[0]);
    }

    socket.setTimeout(300 * 1000);

    socket.on('timeout', function () {
        connection.logerror(plugin, "spamd connection timed out");
        socket.end();
        return next();
    });
    socket.on('error', function (err) {
        connection.logerror(plugin, "spamd connection failed: " + err);
        // don't deny on error - maybe another plugin can deliver
        return next();
    });
    return socket;
};

function msgTooBig(config, connection, plugin) {
    if (!config.main.max_size) return false;

    var bytes = connection.transaction.data_bytes / (1024 * 1024); // to MB
    var max   = config.main.max_size / (1024 * 1024);
    if (bytes > max) {
        connection.loginfo(plugin, 'skipping, size ('+bytes+'MB) exceeds max: '+max);
        return true;
    }
    return false;
};

function logResults(connection, plugin, spamd_response, config) {
    connection.loginfo(plugin, "status=" + spamd_response.flag
        + ', hits=' + spamd_response.hits
        + ', required=' + spamd_response.reqd
        + ', reject=' + ((connection.relaying)
             ? (config.main.relay_reject_threshold || config.main.reject_threshold)
             : config.main.reject_threshold)
        + ', tests="' + spamd_response.tests + '"');
};
