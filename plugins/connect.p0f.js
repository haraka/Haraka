// p0f v3 client - http://lcamtuf.coredump.cx/p0f3/

var net = require('net');
var ipaddr = require('ipaddr.js');

function p0f_client(path) {
    var plugin = this;

    plugin.sock = null;
    plugin.send_queue = [];
    plugin.receive_queue = [];
    plugin.connected = false;
    plugin.ready = false;
    plugin.socket_has_error = false;
    plugin.restart_interval = false;

    plugin.sock = net.createConnection(path);

    plugin.sock.setTimeout(5 * 1000);

    plugin.sock.on('connect', function () {
        plugin.sock.setTimeout(30 * 1000);
        plugin.connected = true;
        plugin.socket_has_error = false;
        plugin.ready = true;
        if (plugin.restart_interval) clearInterval(plugin.restart_interval);
        plugin.process_send_queue();
    });

    plugin.sock.on('data', function (data) {
        for (var i=0; i<data.length/232; i++) {
            plugin.decode_response(data.slice(((i) ? 232*i : 0), 232*(i+1)));
        }
    });

    plugin.sock.on('drain', function () {
        plugin.ready = true;
        plugin.process_send_queue();
    });

    plugin.sock.on('error', function (error) {
        plugin.connected = false;
        error.message = error.message + ' (socket: ' + path + ')';
        plugin.socket_has_error = error;
        plugin.sock.destroy();
        // Try and reconnect
        if (!plugin.restart_interval) {
            plugin.restart_interval = setInterval(function () {
                connect();
            }, 5 * 1000);
        }
        // Clear the receive queue
        for (var i=0; i<plugin.receive_queue.length; i++) {
            var item = plugin.receive_queue.shift();
            item.cb(plugin.socket_has_error);
            continue;
        }
        plugin.process_send_queue();
    });
}

p0f_client.prototype.decode_response = function (data) {
    var plugin = this;
    var decode_string = function (data, start, end) {
        var str = '';
        for (var a=start; a<end; a++) {
            var b = data.readUInt8(a);
            if (b === 0x0) break;
            str = str + String.fromCharCode(b);
        }
        return str;
    };

    if (!plugin.receive_queue.length > 0) {
        throw new Error('unexpected data received');
    }
    var item = plugin.receive_queue.shift();

    ///////////////////
    // Decode packet //
    ///////////////////

    // Response magic dword (0x50304602), native endian.
    if (data.readUInt32LE(0) !== 0x50304602) {
        return item.cb(new Error('bad response magic!'));
    }
    // Status dword: 0x00 for 'bad query', 0x10 for 'OK', and 0x20 for 'no match'
    var st = data.readUInt32LE(4);
    switch (st) {
        case (0x00):
            return item.cb(new Error('bad query'));
        case (0x10):
            var p0f = {
                query:       item.ip,
                first_seen:  data.readUInt32LE(8),
                last_seen:   data.readUInt32LE(12),
                total_conn:  data.readUInt32LE(16),
                uptime_min:  data.readUInt32LE(20),
                up_mod_days: data.readUInt32LE(24),
                last_nat:    data.readUInt32LE(28),
                last_chg:    data.readUInt32LE(32),
                distance:    data.readInt16LE(36),
                bad_sw:      data.readUInt8(38),
                os_match_q:  data.readUInt8(39),
                os_name:     decode_string(data, 40, 72),
                os_flavor:   decode_string(data, 72, 104),
                http_name:   decode_string(data, 104, 136),
                http_flavor: decode_string(data, 136, 168),
                link_type:   decode_string(data, 168, 200),
                language:    decode_string(data, 200, 232),
            };
            return item.cb(null, p0f);
        case (0x20):
            return item.cb(null, null);
        default:
            throw new Error('unknown status: ' + st);
    }
};

p0f_client.prototype.query = function (ip, cb) {
    var plugin = this;
    if (plugin.socket_has_error) {
        return cb(plugin.socket_has_error);
    }
    if (!plugin.connected) {
        return cb(new Error('socket not connected'));
    }
    var addr = ipaddr.parse(ip);
    var bytes = addr.toByteArray();
    var buf = new Buffer(21);
    buf.writeUInt32LE(0x50304601, 0); // query magic
    buf.writeUInt8(((addr.kind() === 'ipv6') ? 0x6 : 0x4), 4);
    for (var i=0; i < bytes.length; i++) {
        buf.writeUInt8(bytes[i], 5 + i);
    }
    if (!plugin.ready) {
        plugin.send_queue.push({ip: ip, cb: cb, buf: buf});
    }
    else {
        plugin.receive_queue.push({ip: ip, cb: cb});
        if (!plugin.sock.write(buf)) plugin.ready = false;
    }
};

p0f_client.prototype.process_send_queue = function () {
    if (this.send_queue.length === 0) { return; }

    for (var i=0; i<this.send_queue.length; i++) {
        if (this.socket_has_error) {
            var item = this.send_queue.shift();
            item.cb(this.socket_has_error);
            continue;
        }
        if (!this.ready) break;
        var item = this.send_queue.shift();
        this.receive_queue.push({ip: item.ip, cb: item.cb});
        if (!this.sock.write(item.buf)) {
            this.ready = false;
        }
    }
};

exports.p0f_client = p0f_client;

exports.hook_init_master = function (next) {
    var cfg = this.config.get('connect.p0f.ini');
    // Start p0f process?
    server.notes.p0f_client = new p0f_client(cfg.main.socket_path);
    return next();
};

exports.hook_init_child = function (next) {
    var cfg = this.config.get('connect.p0f.ini');
    server.notes.p0f_client = new p0f_client(cfg.main.socket_path);
    return next();
}

exports.hook_lookup_rdns = function onLookup(next, connection) {
    var plugin = this;
    var p0f_client = server.notes.p0f_client;
    if (!p0f_client) return next();
    p0f_client.query(connection.remote_ip, function onResults(err, result) {
        if (err) {
            connection.results.add(plugin, {err: err.message});
            return next();
        }

        if (!result) {
            connection.results.add(plugin, {err: 'no p0f results'});
            return next();
        }

        connection.results.add(plugin, result);
        connection.loginfo(plugin, format_results(result));
        return next();
    });
};

function format_results(result) {
    return [
        'os="' + result.os_name + ' ' + result.os_flavor + '"',
        'link_type="' + result.link_type + '"',
        'distance=' + result.distance,
        'total_conn=' + result.total_conn,
        'shared_ip=' + ((result.last_nat === 0) ? 'N' : 'Y'),
    ].join(' ');
}

exports.hook_data_post = function onDataPostP0F(next, connection) {
    var plugin = this;
    var cfg = plugin.config.get('connect.p0f.ini');
    var header_name = cfg.main.add_header;
    if (!header_name) {
        connection.logdebug(plugin, 'header disabled in ini' );
        return next();
    }

    connection.transaction.remove_header(header_name);
    var result = connection.results.get('connect.p0f');
    if (!result) {
        connection.results.add(plugin, {err: 'no p0f note'});
        return next();
    }

    connection.logdebug(plugin, 'adding header' );
    connection.transaction.add_header(header_name, format_results(result));

    return next();
};
