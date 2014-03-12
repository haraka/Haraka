// clamd

var sock = require('./line_socket');

var defaults = {
    clamd_socket: 'localhost:3310',
    timeout: 60,
    max_size: 26214400,
    only_with_attachments: 0,
};

var skip_list_exclude = [];
var skip_list = [];

exports.wildcard_to_regexp = function (str) {
    return str.replace(/[-\[\]\/{}()*+?.,\\^$|#\s]/g, "\\$&").replace(/\\\*/g, '.*').replace(/\\\?/g, '.') + '$';
}

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
            if (list[i][0] === '!') {
                if (list[i][1] === '/') {
                    // Regexp exclude
                    try {
                        var re = new RegExp(list[i].substr(2, list[i].length-2),'i');
                        new_skip_list_exclude.push(re);
                    }
                    catch (e) {
                        self.logerror(e.message + ' (entry: ' + list[i] + ')');
                    }
                }
                else {
                    // Wildcard exclude
                    try {
                        var re = new RegExp(self.wildcard_to_regexp(list[i].substr(1)),'i');
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
                    var re = new RegExp(list[i].substr(1, list[i].length-2),'i');
                    new_skip_list.push(re);
                }
                catch (e) {
                    self.logerror(e.message + ' (entry: ' + list[i] + ')');
                }
            }
            else {
                // Wildcard skip
                try {
                    var re = new RegExp(self.wildcard_to_regexp(list[i]),'i');
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
    };
    loadExcludes();
}

exports.hook_data = function (next, connection) {
    var plugin = this;
    // Load config
    var config = this.config.get('clamd.ini');
    for (var key in defaults) {
        config.main[key] = config.main[key] || defaults[key];
    }
    if (config.main['only_with_attachments']) {
        var transaction = connection.transaction;
        transaction.parse_body = 1;
        transaction.attachment_hooks(function (ctype, filename, body) {
            connection.logdebug(plugin, 'found ctype=' + ctype + ', filename=' + filename);
            transaction.notes.clamd_found_attachment = 1;
        });
    }
    return next();
}

exports.hook_data_post = function (next, connection) {
    var plugin = this;
    var transaction = connection.transaction;

    // Config
    var config = this.config.get('clamd.ini');
    for (var key in defaults) {
        config.main[key] = config.main[key] || defaults[key];
    }

    // Do we need to run?
    if (config.main['only_with_attachments'] &&
        !transaction.notes.clamd_found_attachment)
    {
        connection.logdebug(plugin, 'skipping: no attachments found');
        connection.results.add(plugin, {skip: 'no attachments'});
        return next();
    }

    // Limit message size
    if (transaction.data_bytes > config.main.max_size) {
        connection.results.add(plugin, {skip: 'exceeds max size', emit: true});
        return next();
    }

    var hosts = config.main.clamd_socket.split(/[,; ]+/);

    var randomize = (/(?:true|yes|ok|enabled|1)/.test(config.main.randomize_host_order) ? true : false);
    if (randomize) {
        hosts.sort(function() {return 0.5 - Math.random()});
    }

    var try_next_host = function () {
        var socket;
        var connected = false;
        if (!hosts.length) {
            connection.results.add(plugin, {err: 'connecting', emit: true});
            return next(DENYSOFT, 'Error connecting to virus scanner');
        }
        var host = hosts.shift();
        connection.logdebug(plugin, 'trying host: ' + host);
        var socket = new sock.Socket();

        socket.on('timeout', function () {
            socket.destroy();
            if (connected) {
                connection.results.add(plugin, {err: 'clamd timed out', emit: true});
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
                connection.results.add(plugin, {err: err, emit: true});
                return next(DENYSOFT, 'Virus scanner error');
            }
        });

        socket.on('connect', function () {
            connected = true;
            socket.setTimeout((config.main.timeout * 1000) || 30 * 1000);
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

        socket.setTimeout((config.main.connect_timeout * 1000) || 10 * 1000);

        socket.on('end', function () {
            var m;
            if (/^stream: OK/.test(result)) {
                // OK
                connection.results.add(plugin, {pass: 'clean', emit: true});
                return next();
            }
            else if ((m = /^stream: (\S+) FOUND/.exec(result))) {
                connection.results.add(plugin, {fail: 'virus', emit: true});
                // Virus found
                if (m && m[1]) {
                    var virus = m[1];
                }
                // Check skip list exclusions
                for (var i=0; i < skip_list_exclude.length; i++) {
                    if (skip_list_exclude[i].test(virus)) {
                        return next(DENY, 'Message is infected with ' + (virus || 'UNKONWN'));
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
                connection.results.add(plugin, {err: errmsg, emit: true});
                // Continue as StreamMaxLength default is 25Mb
                return next();
            }
            else {
                // Unknown result
                connection.results.add(plugin, {err: 'unknown result: ' + result, emit: true});
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
    }

    // Start the process
    try_next_host();
};
