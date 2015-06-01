// clamd

var sock = require('./line_socket');

exports.wildcard_to_regexp = function (str) {
    return str
        .replace(/[-\[\]\/{}()*+?.,\\^$|#\s]/g, "\\$&")
        .replace(/\\\*/g, '.*')
        .replace(/\\\?/g, '.') + '$';
};

exports.load_excludes = function() {
    var plugin = this;

    plugin.loginfo('Loading excludes file');
    var list = plugin.config.get('clamd.excludes','list', function () {
        plugin.load_excludes();
    });

    var new_skip_list_exclude = [];
    var new_skip_list = [];
    for (var i=0; i < list.length; i++) {
        var re;
        switch (list[i][0]) {
        case '!':

            if (list[i][1] === '/') {
                // Regexp exclude
                try {
                    re = new RegExp(list[i].substr(2, list[i].length-2),'i');
                    new_skip_list_exclude.push(re);
                }
                catch (e) {
                    plugin.logerror(e.message + ' (entry: ' + list[i] + ')');
                }
            }
            else {
                // Wildcard exclude
                try {
                    re = new RegExp(
                            plugin.wildcard_to_regexp(list[i].substr(1)),'i');
                    new_skip_list_exclude.push(re);
                }
                catch (e) {
                    plugin.logerror(e.message + ' (entry: ' + list[i] + ')');
                }
            }
            break;
        case '/':
            // Regexp skip
            try {
                re = new RegExp(list[i].substr(1, list[i].length-2),'i');
                new_skip_list.push(re);
            }
            catch (e) {
                plugin.logerror(e.message + ' (entry: ' + list[i] + ')');
            }
            break;
        default:
            // Wildcard skip
            try {
                re = new RegExp(plugin.wildcard_to_regexp(list[i]),'i');
                new_skip_list.push(re);
            }
            catch (e) {
                plugin.logerror(e.message + ' (entry: ' + list[i] + ')');
            }
        }
    }

    // Make the new lists visible
    plugin.skip_list_exclude = new_skip_list_exclude;
    plugin.skip_list = new_skip_list;
};

exports.load_clamd_ini = function() {
    var plugin = this;

    plugin.cfg = plugin.config.get('clamd.ini', {
        booleans: [
            '-main.randomize_host_order',
            '-main.only_with_attachments',
        ],
    }, function () {
        plugin.load_clamd_ini();
    });

    var defaults = {
        clamd_socket: 'localhost:3310',
        timeout: 30,
        connect_timeout: 10,
        max_size: 26214400,
    };

    for (var key in defaults) {
        if (plugin.cfg.main[key] === undefined) {
            plugin.cfg.main[key] = defaults[key];
        }
    }

    // resolve mismatch between docs (...attachment) and code (...attachments)
    if (plugin.cfg.main.only_with_attachment !== undefined) {
        plugin.cfg.main.only_with_attachments =
            plugin.cfg.main.only_with_attachment ? true : false;
    }
};

exports.register = function () {
    var plugin = this;
    plugin.load_excludes();
    plugin.load_clamd_ini();
};

exports.hook_data = function (next, connection) {
    var plugin = this;
    if (!plugin.cfg.main.only_with_attachments) return next();

    var txn = connection.transaction;
    txn.parse_body = true;
    txn.attachment_hooks(function (ctype, filename, body) {
        connection.logdebug(plugin,
                'found ctype=' + ctype + ', filename=' + filename);
        txn.notes.clamd_found_attachment = true;
    });

    return next();
};

exports.hook_data_post = function (next, connection) {
    var plugin = this;
    var txn = connection.transaction;
    var cfg = plugin.cfg;

    // Do we need to run?
    if (cfg.main.only_with_attachments && !txn.notes.clamd_found_attachment) {
        connection.logdebug(plugin, 'skipping: no attachments found');
        txn.results.add(plugin, {skip: 'no attachments'});
        return next();
    }

    // Limit message size
    if (txn.data_bytes > cfg.main.max_size) {
        txn.results.add(plugin, {skip: 'exceeds max size', emit: true});
        return next();
    }

    var hosts = cfg.main.clamd_socket.split(/[,; ]+/);

    if (cfg.main.randomize_host_order) {
        hosts.sort(function() {return 0.5 - Math.random();});
    }

    var try_next_host = function () {
        var connected = false;
        if (!hosts.length) {
            if (txn) {
                txn.results.add(plugin, {err: 'connecting', emit: true});
            }
            return next(DENYSOFT, 'Error connecting to virus scanner');
        }
        var host = hosts.shift();
        connection.logdebug(plugin, 'trying host: ' + host);
        var socket = new sock.Socket();

        socket.on('timeout', function () {
            socket.destroy();
            if (!connected) {
                connection.logerror(plugin, 'Timeout connecting to ' + host);
                return try_next_host();
            }
            if (txn) {
                txn.results.add(plugin, {err: 'clamd timed out', emit: true});
            }
            return next(DENYSOFT, 'Virus scanner timed out');
        });

        socket.on('error', function (err) {
            socket.destroy();
            if (!connected) {
                connection.logerror(plugin,
                       'Connection to ' + host + ' failed: ' + err.message);
                return try_next_host();
            }

            if (txn) {
                txn.results.add(plugin, {err: err, emit: true});
            }
            return next(DENYSOFT, 'Virus scanner error');
        });

        socket.on('connect', function () {
            connected = true;
            socket.setTimeout((cfg.main.timeout || 30) * 1000);
            var hp = socket.address(),
              addressInfo = hp === null ? '' : ' ' + hp.address + ':' + hp.port;
            connection.logdebug(plugin, 'connected to host' + addressInfo);
            socket.write("zINSTREAM\0", function () {
                txn.message_stream.pipe(socket, { clamd_style: true });
            });
        });

        var result = '';
        socket.on('line', function (line) {
            connection.logprotocol(plugin, 'C:' + line);
            result = line.replace(/\r?\n/, '');
        });

        socket.setTimeout((cfg.main.connect_timeout || 10) * 1000);

        socket.on('end', function () {
            if (!txn) return next();
            if (/^stream: OK/.test(result)) {                // OK
                txn.results.add(plugin, {pass: 'clean', emit: true});
                return next();
            }
            var m = /^stream: (\S+) FOUND/.exec(result);
            if (m) {
                var virus;                                   // Virus found
                if (m[1]) { virus = m[1]; }
                txn.results.add(plugin, {
                    fail: 'virus' + (virus ? ('(' + virus + ')') : ''),
                    emit: true
                });

                // Check skip list exclusions
                for (var i=0; i < plugin.skip_list_exclude.length; i++) {
                    if (!plugin.skip_list_exclude[i].test(virus)) continue;
                    return next(DENY,
                            'Message is infected with ' + (virus || 'UNKNOWN'));
                }

                // Check skip list
                for (var j=0; j < plugin.skip_list.length; j++) {
                    if (!plugin.skip_list[j].test(virus)) continue;
                    connection.logwarn(plugin, virus + ' matches exclusion');
                    txn.add_header('X-Haraka-Virus', virus);
                    return next();
                }
                return next(DENY, 'Message is infected with ' +
                        (virus || 'UNKNOWN'));
            }
            if (/size limit exceeded/.test(result)) {
                txn.results.add(plugin, {
                    err: 'INSTREAM size limit exceeded. Check ' +
                        'StreamMaxLength in clamd.conf',
                    emit: true
                });
                // Continue as StreamMaxLength default is 25Mb
                return next();
            }

            txn.results.add(plugin, { err: 'unknown result: ' + result });
            return next(DENYSOFT, 'Error running virus scanner');
        });

        var match;
        if (host.match(/^\//)) {
            // assume unix socket
            socket.connect(host);
        }
        else if ((match = /^\[([^\] ]+)\](?::(\d+))?/.exec(host))) {
            // IPv6 literal
            socket.connect((match[2] || 3310), match[1]);
        }
        else {
            // IP:port, hostname:port or hostname
            var hostport = host.split(/:/);
            socket.connect((hostport[1] || 3310), hostport[0]);
        }
    };

    // Start the process
    try_next_host();
};
