'use strict';
// Call spamassassin via spamd

const sock  = require('./line_socket');
const utils = require('haraka-utils');

exports.register = function () {
    const plugin = this;
    plugin.load_spamassassin_ini();
};

exports.load_spamassassin_ini = function () {
    const plugin = this;
    plugin.cfg = plugin.config.get('spamassassin.ini', {
        booleans: [
            '+add_headers',
        ],
    }, function () {
        plugin.load_spamassassin_ini();
    });

    const defaults = {
        spamd_socket: 'localhost:783',
        max_size:     500000,
        old_headers_action: "rename",
        subject_prefix: "*** SPAM ***",
    };

    for (const key in defaults) {
        if (plugin.cfg.main[key]) continue;
        plugin.cfg.main[key] = defaults[key];
    }

    [
        'reject_threshold', 'relay_reject_threshold',
        'munge_subject_threshold', 'max_size'
    ].forEach(function (item) {
        if (!plugin.cfg.main[item]) return;
        plugin.cfg.main[item] = Number(plugin.cfg.main[item]);
    });
};

exports.hook_data_post = function (next, connection) {
    const plugin = this;
    if (plugin.msg_too_big(connection)) return next();

    const username        = plugin.get_spamd_username(connection);
    const headers         = plugin.get_spamd_headers(connection, username);
    const socket          = plugin.get_spamd_socket(next, connection, headers);

    const spamd_response = { headers: {} };
    let state = 'line0';
    let last_header;
    const start = Date.now();

    socket.on('line', function (line) {
        connection.logprotocol(plugin, "Spamd C: " + line + ' state=' + state);
        line = line.replace(/\r?\n/, '');
        if (state === 'line0') {
            spamd_response.line0 = line;
            state = 'response';
        }
        else if (state === 'response') {
            if (line.match(/\S/)) {
                const matches = line.match(/Spam: (True|False) ; (-?\d+\.\d) \/ (-?\d+\.\d)/);
                if (matches) {
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
            const m = line.match(/^X-Spam-([\x21-\x39\x3B-\x7E]+):\s*(.*)/);
            if (m) {
                connection.logdebug(plugin, "header: " + line);
                last_header = m[1];
                spamd_response.headers[m[1]] = m[2];
                return;
            }
            let fold;
            if (last_header && (fold = line.match(/^(\s+.*)/))) {
                spamd_response.headers[last_header] += "\r\n" + fold[1];
                return;
            }
            last_header = '';
        }
    });

    socket.once('end', function () {
        // Abort if the transaction is gone
        if (!connection.transaction) return next();

        if (spamd_response.headers && spamd_response.headers.Tests) {
            spamd_response.tests = spamd_response.headers.Tests;
        }
        if (spamd_response.tests === undefined) {
            // strip the 'tests' from the X-Spam-Status header
            if (spamd_response.headers && spamd_response.headers.Status) {
                // SpamAssassin appears to have a bug that causes a space not to
                // be added before autolearn= when the header line has been folded.
                // So we modify the regexp here not to match autolearn onwards.
                const tests = /tests=((?:(?!autolearn)[^ ])+)/.exec(
                    spamd_response.headers.Status.replace(/\r?\n\t/g,'')
                );
                if (tests) { spamd_response.tests = tests[1]; }
            }
        }

        // do stuff with the results...
        connection.transaction.notes.spamassassin = spamd_response;
        connection.results.add(plugin, {
            time: (Date.now() - start)/1000,
            hits: spamd_response.hits,
            flag: spamd_response.flag,
        });

        plugin.fixup_old_headers(connection.transaction);
        plugin.do_header_updates(connection, spamd_response);
        plugin.log_results(connection, spamd_response);

        const exceeds_err = plugin.score_too_high(connection, spamd_response);
        if (exceeds_err) return next(DENY, exceeds_err);

        plugin.munge_subject(connection, spamd_response.score);

        return next();
    });
};

exports.fixup_old_headers = function (transaction) {
    const plugin = this;
    const action = plugin.cfg.main.old_headers_action;
    const headers = transaction.notes.spamassassin.headers;

    let key;
    switch (action) {
        case "keep":
            break;
        case "drop":
            for (key in headers) {
                if (!key) continue;
                transaction.remove_header('X-Spam-' + key);
            }
            break;
        // case 'rename':
        default:
            for (key in headers) {
                if (!key) continue;
                key = 'X-Spam-' + key;
                const old_val = transaction.header.get(key);
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
    const plugin = this;
    const munge = plugin.cfg.main.munge_subject_threshold;
    if (!munge) return;
    if (parseFloat(score) < parseFloat(munge)) return;

    const subj = connection.transaction.header.get('Subject');
    const subject_re = new RegExp('^' + utils.regexp_escape(plugin.cfg.main.subject_prefix));
    if (subject_re.test(subj)) return;    // prevent double munge

    connection.transaction.remove_header('Subject');
    connection.transaction.add_header('Subject', plugin.cfg.main.subject_prefix + " " + subj);
};

exports.do_header_updates = function (connection, spamd_response) {
    const plugin = this;
    if (spamd_response.flag === 'Yes') {
        // X-Spam-Flag is added by SpamAssassin
        connection.transaction.remove_header('precedence');
        connection.transaction.add_header('Precedence', 'junk');
    }

    const modern = plugin.cfg.main.modern_status_syntax;
    if ( !plugin.cfg.main.add_headers ) return;

    for (const key in spamd_response.headers) {
        if (!key || key === '' || key === undefined) continue;
        let val = spamd_response.headers[key];
        if (val === undefined) { val = ''; }

        if (key === 'Status' && !modern) {
            const legacy = spamd_response.headers[key].replace(/ score=/,' hits=');
            connection.transaction.add_header('X-Spam-Status', legacy);
            continue;
        }
        connection.transaction.add_header('X-Spam-' + key, val);
    }
};

exports.score_too_high = function (connection, spamd_response) {
    const plugin = this;
    const score = spamd_response.score;
    if (connection.relaying) {
        const rmax = plugin.cfg.main.relay_reject_threshold;
        if (rmax && (score >= rmax)) {
            return "spam score exceeded relay threshold";
        }
    }

    const max = plugin.cfg.main.reject_threshold;
    if (max && (score >= max)) {
        return "spam score exceeded threshold";
    }

    return false;
};

exports.get_spamd_username = function (connection) {
    const plugin = this;

    let user = connection.transaction.notes.spamd_user;  // 1st priority
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

exports.get_spamd_headers = function (connection, username) {
    // http://svn.apache.org/repos/asf/spamassassin/trunk/spamd/PROTOCOL
    const headers = [
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

exports.get_spamd_socket = function (next, connection, headers) {
    const plugin = this;
    // TODO: support multiple spamd backends

    const socket = new sock.Socket();
    socket.is_connected = false;
    const results_timeout = parseInt(plugin.cfg.main.results_timeout) || 300;

    socket.on('connect', function () {
        if (!connection.transaction) {
            socket.end();
            return;
        }
        this.is_connected = true;
        // Reset timeout
        this.setTimeout(results_timeout * 1000);
        socket.write(headers.join("\r\n") + "\r\n");
        connection.transaction.message_stream.pipe(socket);
    });

    socket.on('error', function (err) {
        connection.logerror(plugin, 'connection failed: ' + err);
        // TODO: optionally DENYSOFT
        // TODO: add a transaction note
        return next();
    });

    socket.on('timeout', function () {
        if (!this.is_connected) {
            connection.logerror(plugin, 'spamd connection timed out');
        }
        else {
            connection.logerror(plugin, 'timeout waiting for results');
        }
        socket.end();
        return next();
    });

    const connect_timeout = parseInt(plugin.cfg.main.connect_timeout) || 30;
    socket.setTimeout(connect_timeout * 1000);

    if (plugin.cfg.main.spamd_socket.match(/\//)) {    // assume unix socket
        socket.connect(plugin.cfg.main.spamd_socket);
    }
    else {
        const hostport = plugin.cfg.main.spamd_socket.split(/:/);
        socket.connect((hostport[1] || 783), hostport[0]);
    }

    return socket;
};

exports.msg_too_big = function (connection) {
    const plugin = this;
    if (!plugin.cfg.main.max_size) return false;

    const size = connection.transaction.data_bytes;

    const max = plugin.cfg.main.max_size;
    if (size <= max) { return false; }
    connection.loginfo(plugin, 'skipping, size ' + utils.prettySize(size) +
            ' exceeds max: ' + utils.prettySize(max));
    return true;
};

exports.log_results = function (connection, spamd_response) {
    const plugin = this;
    const cfg = plugin.cfg.main;
    connection.loginfo(plugin, "status=" + spamd_response.flag +
          ', score=' + spamd_response.score +
          ', required=' + spamd_response.reqd +
          ', reject=' + ((connection.relaying) ?
            (cfg.relay_reject_threshold || cfg.reject_threshold) : cfg.reject_threshold) +
          ', tests="' + spamd_response.tests + '"');
};
