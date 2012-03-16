// clamd

var sock = require('./line_socket');

var defaults = {
    clamd_socket: 'localhost:3310',
    timeout: 60,
    max_size: 26214400,
    only_with_attachments: 0,
};

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
        return next();
    }

    // Limit message size
    if (transaction.data_bytes > config.main.max_size) {
        connection.logdebug(plugin, 'skipping: message too big');
        return next();
    }

    // TODO: allow a list of hosts to try
    var socket = new sock.Socket();
    if (config.main.clamd_socket.match(/\//)) {
        // assume unix socket
        socket.connect(config.main.clamd_socket);
    }
    else {
        var hostport = config.main.clamd_socket.split(/:/);
        socket.connect(hostport[1] || 3310, hostport[0]);
    }

    socket.setTimeout(config.main.timeout * 1000);

    var pack_len = function(length) {
        var len = new Buffer(4);
        len[3] = length & 0xFF;
        len[2] = (length >> 8) & 0xFF;
        len[1] = (length >> 16) & 0xFF;
        len[0] = (length >> 24) & 0xFF;
        return len;
    }

    var data_marker = 0; ///< The current line number we're sending to clamd
    var in_data = false; ///< We're sending data, but not done yet
    var data_line = "";  ///< The current line we're sending to clamd
    
    var send_data = function () {
        in_data = true;
        var wrote_all = true;
        while (wrote_all && (data_marker < transaction.data_lines.length)) {
            if (data_line) {
                // If the current line is not empty, we haven't sent it yet
                data_marker++;
                wrote_all = socket.write(data_line);
                data_line = "";
                if (!wrote_all) {
                    return;
                }
            }
            if (data_marker < transaction.data_lines.length) {
                // If we a line yet to write, encode the length and send it
                data_line = transaction.data_lines[data_marker];
                var len = Buffer.byteLength(data_line);
                var buf = pack_len(len);
                connection.logdata(plugin, "C{len=" + len + "}: " + data_line);
                wrote_all = socket.write(buf);
            }
        }
        if (wrote_all) {
            // We're at the end of the data_lines - send a zero length line
            in_data = false; // We don't need to be called by socket.on('drain' ...
            socket.end(pack_len(0));
        }
    };

    socket.on('drain', function () {
        if (in_data) {
            process.nextTick(function () { send_data() });
        }
    });
    socket.on('timeout', function () {
        connection.logerror(plugin, "connection timed out");
        socket.destroy();
        return next(DENYSOFT,'Virus scanner timed out');
    });
    socket.on('error', function (err) {
        connection.logerror(plugin, "connection failed: " + err);
        socket.destroy();
        return next(DENYSOFT,'Error connecting to virus scanner');
    });
    socket.on('connect', function () {
        var hp = socket.address(),
          addressInfo = hp === null ? '' : ' ' + hp.address + ':' + hp.port;

        connection.loginfo(plugin, 'connected to host' + addressInfo);

        socket.write("zINSTREAM\0", function () {
            send_data();
        });
    });
    
    var result = "";
    socket.on('line', function (line) {
        connection.logprotocol(plugin, 'C:' + line);
        result = line.replace(/\r?\n/, '');
    });
    
    socket.on('end', function () {
        var m;
        if (/^stream: OK/.test(result)) {
            // OK
            return next();
        }
        else if ((m = /^stream: (\S+) FOUND/.exec(result))) {
            // Virus found
            if (m && m[1]) {
                var virus = m[1];
            }
            return next(DENY, 'Message is infected with ' +
                        (virus || 'UNKNOWN'));
        }
        else if (/size limit exceeded/.test(result)) {
            connection.loginfo(plugin, 'INSTREAM size limit exceeded. ' +
                           'Check StreamMaxLength in clamd.conf');
            // Continue as StreamMaxLength default is 25Mb
            return next();
        } else {
            // Unknown result
            connection.logerror(plugin, 'unknown result: ' + result);
            return next(DENYSOFT, 'Error running virus scanner');
        }
        return next();
    });
};
