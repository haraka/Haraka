// clamd

var sock = require('./line_socket');

var skip_list_exclude = [];
var skip_list = [];

exports.wildcard_to_regexp = function (str) {
    return str.replace(/[-\[\]\/{}()*+?.,\\^$|#\s]/g, "\\$&").replace(/\\\*/g, '.*').replace(/\\\?/g, '.') + '$';
};

exports.register = function () {
    var self = this;
    function loadExcludes() {
        self.loginfo('Loading excludes file');
        var list = self.config.get('clamd.excludes','list', function () {
            loadExcludes();
        });
        var new_skip_list_exclude = [];
        var new_skip_list = [];
        for (var i=0; i < list.length; i++) {
            var re;
            if (list[i][0] === '!') {
                if (list[i][1] === '/') {
                    // Regexp exclude
                    try {
                        re = new RegExp(list[i].substr(2, list[i].length-2),'i');
                        new_skip_list_exclude.push(re);
                    }
                    catch (e) {
                        self.logerror(e.message + ' (entry: ' + list[i] + ')');
                    }
                }
                else {
                    // Wildcard exclude
                    try {
                        re = new RegExp(self.wildcard_to_regexp(list[i].substr(1)),'i');
                        new_skip_list_exclude.push(re);
                    }
                    catch (e) {
                        self.logerror(e.message + ' (entry: ' + list[i] + ')');
                    }
                }
            }
            else if (list[i][0] === '/') {
                // Regexp skip
                try {
                    re = new RegExp(list[i].substr(1, list[i].length-2),'i');
                    new_skip_list.push(re);
                }
                catch (e) {
                    self.logerror(e.message + ' (entry: ' + list[i] + ')');
                }
            }
            else {
                // Wildcard skip
                try {
                    re = new RegExp(self.wildcard_to_regexp(list[i]),'i');
                    new_skip_list.push(re);
                }
                catch (e) {
                    self.logerror(e.message + ' (entry: ' + list[i] + ')');
                }
            }
        }
        // Make the new lists visible
        skip_list_exclude = new_skip_list_exclude;
        skip_list = new_skip_list;
    }
    loadExcludes();
};

exports.refresh_config = function() {
    this.cfg = this.config.get('clamd.ini', {
        booleans: [
            '-main.randomize_host_order',
            '-main.only_with_attachments',
        ],
    });

    var defaults = {
        clamd_socket: 'localhost:3310',
        timeout: 30,
        connect_timeout: 10,
        max_size: 26214400,
    };

    for (var key in defaults) {
        if (this.cfg.main[key] === undefined) this.cfg.main[key] = defaults[key];
    }

    // resolve mismatch between docs (...attachment) and code (...attachments)
    if (this.cfg.main.only_with_attachment !== undefined) {
        this.cfg.main.only_with_attachments = this.cfg.main.only_with_attachment ? true : false;
    }

    return this.cfg;
};

exports.hook_data = function (next, connection) {
    var plugin = this;
    this.refresh_config();
    if (!this.cfg.main.only_with_attachments) return next();

    var transaction = connection.transaction;
    transaction.parse_body = true;
    transaction.attachment_hooks(function (ctype, filename, body) {
        connection.logdebug(plugin, 'found ctype=' + ctype + ', filename=' + filename);
        transaction.notes.clamd_found_attachment = true;
    });

    return next();
};

exports.hook_data_post = function (next, connection) {
    var plugin = this;
    var transaction = connection.transaction;

    // Do we need to run?
    if (plugin.cfg.main.only_with_attachments &&
        !transaction.notes.clamd_found_attachment)
    {
        connection.logdebug(plugin, 'skipping: no attachments found');
        transaction.results.add(plugin, {skip: 'no attachments'});
        return next();
    }

    // Limit message size
    if (transaction.data_bytes > plugin.cfg.main.max_size) {
        transaction.results.add(plugin, {skip: 'exceeds max size', emit: true});
        return next();
    }

    var hosts = plugin.cfg.main.clamd_socket.split(/[,; ]+/);

    if (plugin.cfg.main.randomize_host_order) {
        hosts.sort(function() {return 0.5 - Math.random();});
    }

    var try_next_host = function () {
        var connected = false;
        if (!hosts.length) {
            if (transaction) {
                transaction.results.add(plugin, {err: 'connecting', emit: true});
            }
            return next(DENYSOFT, 'Error connecting to virus scanner');
        }
        var host = hosts.shift();
        connection.logdebug(plugin, 'trying host: ' + host);
        var socket = new sock.Socket();

        socket.on('timeout', function () {
            socket.destroy();
            if (connected) {
                if (transaction) {
                    transaction.results.add(plugin, {err: 'clamd timed out', emit: true});
                }
                return next(DENYSOFT, 'Virus scanner timed out');
            }
            else {
                connection.logerror(plugin, 'Timeout connecting to ' + host);
                try_next_host();
            }
        });

        socket.on('error', function (err) {
            socket.destroy();
            if (!connected) {
                connection.logerror(plugin, 'Connection to ' + host + ' failed: ' + err.message);
                try_next_host();
            }
            else {
                if (transaction) {
                    transaction.results.add(plugin, {err: err, emit: true});
                }
                return next(DENYSOFT, 'Virus scanner error');
            }
        });

        socket.on('connect', function () {
            connected = true;
            socket.setTimeout((plugin.cfg.main.timeout || 30) * 1000);
            var hp = socket.address(),
              addressInfo = hp === null ? '' : ' ' + hp.address + ':' + hp.port;
            connection.logdebug(plugin, 'connected to host' + addressInfo);
            socket.write("zINSTREAM\0", function () {
                transaction.message_stream.pipe(socket, { clamd_style: true });
            });
        });

        var result = "";
        socket.on('line', function (line) {
            connection.logprotocol(plugin, 'C:' + line);
            result = line.replace(/\r?\n/, '');
        });

        socket.setTimeout((plugin.cfg.main.connect_timeout || 10) * 1000);

        socket.on('end', function () {
            var m;
            if (/^stream: OK/.test(result)) {
                // OK
                if (transaction) {
                    transaction.results.add(plugin, {pass: 'clean', emit: true});
                }
                return next();
            }
            else if ((m = /^stream: (\S+) FOUND/.exec(result))) {
                var virus;
                // Virus found
                if (m && m[1]) {
                    virus = m[1];
                }
                if (transaction) {
                    transaction.results.add(plugin, {fail: 'virus' + (virus ? ('(' + virus + ')') : ''), emit: true});
                }
                // Check skip list exclusions
                for (var i=0; i < skip_list_exclude.length; i++) {
                    if (skip_list_exclude[i].test(virus)) {
                        return next(DENY, 'Message is infected with ' + (virus || 'UNKNOWN'));
                    }
                }
                // Check skip list
                for (var i=0; i < skip_list.length; i++) {
                    if (skip_list[i].test(virus)) {
                        connection.logwarn(plugin, virus + ' matches exclusion');
                        // Add header
                        transaction.add_header('X-Haraka-Virus', virus);
                        return next();
                    }
                }
                return next(DENY, 'Message is infected with ' + (virus || 'UNKNOWN'));
            }
            else if (/size limit exceeded/.test(result)) {
                var errmsg = 'INSTREAM size limit exceeded. Check StreamMaxLength in clamd.conf';
                if (transaction) {
                    transaction.results.add(plugin, {err: errmsg, emit: true});
                }
                // Continue as StreamMaxLength default is 25Mb
                return next();
            }
            else {
                // Unknown result
                if (transaction) {
                    transaction.results.add(plugin, {err: 'unknown result: ' + result, emit: true});
                }
                return next(DENYSOFT, 'Error running virus scanner');
            }
            return next();
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
