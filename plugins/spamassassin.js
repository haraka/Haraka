// Call spamassassin via spamd

var sock = require('./line_socket');
var prettySize = require('./utils').prettySize;

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

    var username        = get_spamd_username(config, connection);
    var headers         = get_spamd_headers(connection, username);
    var socket          = get_spamd_socket(config, next, connection, plugin);
    socket.is_connected = false;
    var results_timeout = parseInt(config.main.results_timeout) || 300;

    socket.on('connect', function () {
        this.is_connected = true;
        // Reset timeout
        this.setTimeout(results_timeout * 1000);
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
                    spamd_response.score = matches[2];
                    spamd_response.hits = matches[2];  // backwards compat
                    spamd_response.reqd = matches[3];
                    spamd_response.flag = spamd_response.flag === 'True' ? 'Yes' : 'No';
                }
            }
            else {
                state = 'headers';
            }
        }
        else if (state === 'headers') {
            var m;   // printable ASCII: [ -~]
            if (m = line.match(/^X-Spam-([ -~]+):(.*)/)) {
                // connection.logdebug(plugin, "header: " + line);
                last_header = m[1];
                spamd_response.headers[m[1]] = m[2];
                return;
            }
            var fold;
            if (last_header && (fold = line.match(/^(\s+.*)/))) {
                spamd_response.headers[last_header] += "\r\n" + fold[1];
                return;
            }
            last_header = '';
        }
    });

    socket.on('end', function () {
        // Abort if the transaction is gone
        if (!connection.transaction) return next();

        if (spamd_response.headers['Tests']) {
            spamd_response.tests = spamd_response.headers['Tests'];
        }
        if (spamd_response.tests === undefined) {
            // strip the 'tests' from the X-Spam-Status header
            var tests;
            if (spamd_response.headers['Status'] && 
                tests = /tests=([^ ]+)/.exec(spamd_response.headers['Status'].replace(/\r?\n\t/g,''))) 
            {
                spamd_response.tests = tests[1];
            }
        }

        // do stuff with the results...
        connection.transaction.notes.spamassassin = spamd_response;

        plugin.fixup_old_headers(config.main.old_headers_action, connection.transaction);
        plugin.do_header_updates(connection, spamd_response, config);
        log_results(connection, plugin, spamd_response, config);

        var exceeds_err = score_too_high(config, connection, spamd_response);
        if (exceeds_err) return next(DENY, exceeds_err);

        munge_subject(connection, config, spamd_response.score);

        return next();
    });
};

exports.fixup_old_headers = function (action, transaction) {
    var plugin = this;
    var headers = transaction.notes.spamassassin.headers;

    switch (action) {
        case "keep":
            break;
        case "drop":
            for (var key in headers) {
                if (!key) continue;
                transaction.remove_header('X-Spam-' + key);
            }
            break;
        case "rename":
        default:
            for (var key in headers) {
                if (!key) continue;
                key = 'X-Spam-' + key;
                var old_val = transaction.header.get(key);
                transaction.remove_header(key);
                if (old_val) {
                    // plugin.logdebug(plugin, "header: " + key + ', ' + old_val);
                    transaction.add_header(key.replace(/^X-/, 'X-Old-'), old_val);
                }
            }
            break;
    }
};

function munge_subject(connection, config, score) {
    var munge = config.main.munge_subject_threshold;
    if (!munge) return;
    if (parseFloat(score) < parseFloat(munge)) return;

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

exports.do_header_updates = function (connection, spamd_response, config) {
    var plugin = this;
    if (spamd_response.flag === 'Yes') {
        // X-Spam-Flag is added by SpamAssassin
        connection.transaction.remove_header('precedence');
        connection.transaction.add_header('Precedence', 'junk');
    }

    var modern = config.main.modern_status_syntax;
    for (var key in spamd_response.headers) {
        if (!key || key === '' || key === undefined) continue;
        var val = spamd_response.headers[key];
        if (val === undefined) { val = ''; }

        if (key === 'Status' && !modern) {
            var legacy = spamd_response.headers[key].replace(/ score=/,' hits=');
            connection.transaction.add_header('X-Spam-Status', legacy);
            continue;
        }
        connection.transaction.add_header('X-Spam-' + key, val);
    }
};

function score_too_high(config, connection, spamd_response) {
    var score = spamd_response.score;
    if (connection.relaying) {
        var rmax = config.main.relay_reject_threshold;
        if (rmax && (score >= rmax)) {
            return "spam score exceeded relay threshold";
        }
    };

    var max = config.main.reject_threshold;
    if (max && (score >= max)) {
        return "spam score exceeded threshold";
    }

    return;
}

function get_spamd_username(config, connection) {

    var user = connection.transaction.notes.spamd_user;  // 1st priority
    if (user && user !== undefined) return user;

    if (!config.main.spamd_user) return 'default';   // when not defined
    user = config.main.spamd_user;

    // Enable per-user SA prefs
    if (user === 'first-recipient') {                // special cases
        return connection.transaction.rcpt_to[0].address();
    }
    if (user === 'all-recipients') {
        throw "Unimplemented";
        // TODO: pass the message through SA for each recipient. Then apply
        // the least strict result to the connection. That is useful when
        // one user blacklists a sender that another user wants to get mail
        // from. If this is something you care about, this is the spot.
    }
    return user;
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
}

function get_spamd_socket(config, next, connection, plugin) {
    // TODO: support multiple spamd backends
    var socket = new sock.Socket();
    if (config.main.spamd_socket.match(/\//)) {    // assume unix socket
        socket.connect(config.main.spamd_socket);
    }
    else {
        var hostport = config.main.spamd_socket.split(/:/);
        socket.connect((hostport[1] || 783), hostport[0]);
    }

    var connect_timeout = parseInt(config.main.connect_timeout) || 30;
    socket.setTimeout(connect_timeout * 1000);

    socket.on('timeout', function () {
        if (!this.is_connected) {
            connection.logerror(plugin, 'connection timed out');
        }
        else {
            connection.logerror(plugin, 'timeout waiting for results');
        }
        socket.end();
        return next();
    });
    socket.on('error', function (err) {
        connection.logerror(plugin, 'connection failed: ' + err);
        // TODO: optionally DENYSOFT
        // TODO: add a transaction note
        return next();
    });
    return socket;
};

function msg_too_big(config, connection, plugin) {
    if (!config.main.max_size) return false;

    var size = connection.transaction.data_bytes;
    var max = config.main.max_size;
    if (size > max) {
        connection.loginfo(plugin, 'skipping, size ' + prettySize(size) + ' exceeds max: ' + prettySize(max));
        return true;
    }
    return false;
};

function log_results(connection, plugin, spamd_response, config) {
    connection.loginfo(plugin, "status=" + spamd_response.flag +
          ', score=' + spamd_response.score +
          ', required=' + spamd_response.reqd +
          ', reject=' + ((connection.relaying) ?
             (config.main.relay_reject_threshold || config.main.reject_threshold) :
             config.main.reject_threshold) +
          ', tests="' + spamd_response.tests + '"');
};
