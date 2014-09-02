// Call spamassassin via spamd

var sock = require('./line_socket');
var prettySize = require('./utils').prettySize;

var defaults = {
    spamd_socket: 'localhost:783',
    max_size:     500000,
    old_headers_action: "rename",
    subject_prefix: "*** SPAM ***",
};

exports.register = function () {
    var plugin = this;
    var load_config = function () {
        plugin.loginfo("loading spamassassin.ini");
        plugin.cfg = plugin.config.get('spamassassin.ini', load_config);

        for (var key in defaults) {
            if (plugin.cfg.main[key]) continue;
            plugin.cfg.main[key] = defaults[key];
        }

        ['reject_threshold', 'relay_reject_threshold',
        'munge_subject_threshold', 'max_size'].forEach(function (item) {
            if (!plugin.cfg.main[item]) return;
            plugin.cfg.main[item] = Number(plugin.cfg.main[item]);
        });
    };
    load_config();
};

exports.hook_data_post = function (next, connection) {
    var plugin = this;
    if (plugin.msg_too_big(connection)) return next();

    var username        = plugin.get_spamd_username(connection);
    var headers         = plugin.get_spamd_headers(connection, username);
    var socket          = plugin.get_spamd_socket(next, connection);
    socket.is_connected = false;
    var results_timeout = parseInt(plugin.cfg.main.results_timeout) || 300;

    socket.on('connect', function () {
        if (!connection.transaction) {
            socket.end();
            return next();
        }
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

        if (spamd_response.headers && spamd_response.headers.Tests) {
            spamd_response.tests = spamd_response.headers.Tests;
        }
        if (spamd_response.tests === undefined) {
            // strip the 'tests' from the X-Spam-Status header
            if (spamd_response.headers && spamd_response.headers.Status) {
                var tests = /tests=([^ ]+)/.exec(spamd_response.headers.Status.replace(/\r?\n\t/g,''));
                if (tests) { spamd_response.tests = tests[1]; }
            }
        }

        // do stuff with the results...
        connection.transaction.notes.spamassassin = spamd_response;

        plugin.fixup_old_headers(connection.transaction);
        plugin.do_header_updates(connection, spamd_response);
        plugin.log_results(connection, spamd_response);

        var exceeds_err = plugin.score_too_high(connection, spamd_response);
        if (exceeds_err) return next(DENY, exceeds_err);

        plugin.munge_subject(connection, spamd_response.score);

        return next();
    });
};

exports.fixup_old_headers = function (transaction) {
    var plugin = this;
    var action = plugin.cfg.main.old_headers_action;
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

exports.munge_subject = function (connection, score) {
    var plugin = this;
    var munge = plugin.cfg.main.munge_subject_threshold;
    if (!munge) return;
    if (parseFloat(score) < parseFloat(munge)) return;

    var subj = connection.transaction.header.get('Subject');
    var subject_re = new RegExp('^' + plugin.cfg.main.subject_prefix);
    if (subject_re.test(subj)) return;    // prevent double munge

    connection.transaction.remove_header('Subject');
    connection.transaction.add_header('Subject', plugin.cfg.main.subject_prefix + " " + subj);
};

exports.do_header_updates = function (connection, spamd_response) {
    var plugin = this;
    if (spamd_response.flag === 'Yes') {
        // X-Spam-Flag is added by SpamAssassin
        connection.transaction.remove_header('precedence');
        connection.transaction.add_header('Precedence', 'junk');
    }

    var modern = plugin.cfg.main.modern_status_syntax;
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

exports.score_too_high = function (connection, spamd_response) {
    var plugin = this;
    var score = spamd_response.score;
    if (connection.relaying) {
        var rmax = plugin.cfg.main.relay_reject_threshold;
        if (rmax && (score >= rmax)) {
            return "spam score exceeded relay threshold";
        }
    }

    var max = plugin.cfg.main.reject_threshold;
    if (max && (score >= max)) {
        return "spam score exceeded threshold";
    }

    return;
};

exports.get_spamd_username = function(connection) {
    var plugin = this;

    var user = connection.transaction.notes.spamd_user;  // 1st priority
    if (user && user !== undefined) return user;

    if (!plugin.cfg.main.spamd_user) return 'default';   // when not defined
    user = plugin.cfg.main.spamd_user;

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
};

exports.get_spamd_headers = function(connection, username) {
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

exports.get_spamd_socket = function(next, connection) {
    var plugin = this;
    // TODO: support multiple spamd backends
    var socket = new sock.Socket();
    if (plugin.cfg.main.spamd_socket.match(/\//)) {    // assume unix socket
        socket.connect(plugin.cfg.main.spamd_socket);
    }
    else {
        var hostport = plugin.cfg.main.spamd_socket.split(/:/);
        socket.connect((hostport[1] || 783), hostport[0]);
    }

    var connect_timeout = parseInt(plugin.cfg.main.connect_timeout) || 30;
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
}

exports.msg_too_big = function(connection) {
    var plugin = this;
    if (!plugin.cfg.main.max_size) return false;

    var size = connection.transaction.data_bytes;

    var max = plugin.cfg.main.max_size;
    if (size <= max) { return false; }
    connection.loginfo(plugin, 'skipping, size ' + prettySize(size) + ' exceeds max: ' + prettySize(max));
    return true;
};

exports.log_results = function(connection, spamd_response) {
    var plugin = this;
    var cfg = plugin.cfg.main;
    connection.loginfo(plugin, "status=" + spamd_response.flag +
          ', score=' + spamd_response.score +
          ', required=' + spamd_response.reqd +
          ', reject=' + ((connection.relaying) ?
             (cfg.relay_reject_threshold || cfg.reject_threshold) : cfg.reject_threshold) +
          ', tests="' + spamd_response.tests + '"');
}
