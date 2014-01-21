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

    setup_defaults(config);

    if (msg_too_big(config, connection, plugin)) return next();

    var username = get_spamd_username(config, connection);
    var headers  = get_spamd_headers(connection, username);
    var socket   = get_spamd_socket(config, next, connection, plugin);

    socket.on('connect', function () {
        socket.write(headers.join("\r\n"));
        connection.transaction.message_stream.pipe(socket);
    });

    var spamd_response = { headers: {} };
    var state = 'line0';
    var last_header;

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
                state = 'headers';
            }
        }
        else if (state === 'headers') {
            var m;   // printable ASCII: [ -~]
            if (m = line.match(/^X-Spam-([ -~]+):\s(.*)/)) {
                last_header = m[1];
                spamd_response.headers[m[1]] = m[2];
                if (m[1] === 'Tests') spamd_response.tests = m[2];
                return;
            };
            var fold;
            if (last_header && (fold = line.match(/^(\s+.*)/))) {
                spamd_response.headers[last_header] += fold[1];
                return;
            };
            last_header = '';
        }
    });

    socket.on('end', function () {
        // Abort if the connection or transaction are gone
        if (!connection || (connection && !connection.transaction)) return next();

        // do stuff with the results...
        connection.transaction.notes.spamassassin = spamd_response;

        plugin.fixup_old_headers(config.main.old_headers_action, connection.transaction);
        do_header_updates(connection, spamd_response, config);
        log_results(connection, plugin, spamd_response, config);

        var exceeds_err = hits_too_high(config, connection, spamd_response);
        if (exceeds_err) return next(DENY, exceeds_err);

        munge_subject(connection, config, spamd_response.hits);

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

function munge_subject(connection, config, hits) {
    var munge = config.main.munge_subject_threshold;
    if (!munge) return;
    if (parseFloat(hits) < parseFloat(munge)) return;

    var subj = connection.transaction.header.get('Subject');
    var subject_re = new RegExp('^' + config.main.subject_prefix);
    if (subject_re.test(subj)) return;    // prevent double munge

    connection.transaction.remove_header('Subject');
    connection.transaction.add_header('Subject', config.main.subject_prefix + " " + subj);
};

function setup_defaults(config) {
    for (var key in defaults) {
        config.main[key] = config.main[key] || defaults[key];
    }

    ['reject_threshold', 'relay_reject_threshold',
     'munge_subject_threshold', 'max_size'].forEach(function (item) {
        if (!config.main[item]) return;
        config.main[item] = Number(config.main[item]);
    });
};

function do_header_updates(connection, spamd_response, config) {

    if (spamd_response.flag === 'Yes') {
        connection.transaction.add_header('X-Spam-Flag', 'YES');
        connection.transaction.remove_header('precedence');
        connection.transaction.add_header('Precedence', 'junk');
    }

    Object.keys(spamd_response.headers).forEach(function(key) {
        var modern = config.main.modern_status_syntax;
        // connection.logdebug("modern: "+modern);

        if (key === 'Status' && (!modern || modern === undefined)) {
            var legacy = spamd_response.headers[key].replace(/score/,'hits');
            connection.transaction.add_header('X-Spam-Status', legacy + ' tests=' + spamd_response.tests);
            return;
        };
        connection.transaction.add_header('X-Spam-' + key, spamd_response.headers[key]);
    });
};

function hits_too_high(config, connection, spamd_response) {
    var hits = spamd_response.hits;
    if (connection.relaying) {
        var rmax = config.main.relay_reject_threshold;
        if (rmax && (hits >= rmax)) {
            return "spam score exceeded relay threshold";
        }
    };

    var max = config.main.reject_threshold;
    if (max && (hits >= max)) {
        return "spam score exceeded threshold";
    }

    return;
}

function get_spamd_headers(connection, username) {
    // http://svn.apache.org/repos/asf/spamassassin/trunk/spamd/PROTOCOL
    var headers = [
        'HEADERS SPAMC/1.3',
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

function get_spamd_username(config, connection) {
     var user = config.main.spamd_user ||
               connection.transaction.notes.spamd_user ||
              'default';

    if (user === 'vpopmail') {    // for per-user SA prefs
        return connection.transaction.rcpt_to[0].address();
    };
    return user;
};

function get_spamd_socket(config, next, connection, plugin) {
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

function msg_too_big(config, connection, plugin) {
    if (!config.main.max_size) return false;

    var msg_mb = connection.transaction.data_bytes / (1024 * 1024); // to MB
    var max_mb= config.main.max_size / (1024 * 1024);
    if (msg_mb > max_mb) {
        connection.loginfo(plugin, 'skipping, size (' + bytes.toFixed(2) + 'MB) exceeds max: ' + max);
        return true;
    }
    return false;
};

function log_results(connection, plugin, spamd_response, config) {
    connection.loginfo(plugin, "status=" + spamd_response.flag
        + ', hits=' + spamd_response.hits
        + ', required=' + spamd_response.reqd
        + ', reject=' + ((connection.relaying)
             ? (config.main.relay_reject_threshold || config.main.reject_threshold)
             : config.main.reject_threshold)
        + ', tests="' + spamd_response.tests + '"');
};
