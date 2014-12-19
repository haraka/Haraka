// Auth against vpopmaild

var net    = require('net'),
    crypto = require('crypto');

exports.register = function () {
    var plugin = this;
    plugin.inherits('auth/auth_base');
    plugin.load_vpop_ini();
};

exports.load_vpop_ini = function () {
    var plugin = this;
    plugin.cfg = plugin.config.get('auth_vpopmaild.ini', function () {
        plugin.load_vpop_ini();
    });
};

exports.hook_capabilities = function (next, connection) {
    if (!connection.using_tls) { return next(); }
    var plugin = this;

    var methods = [ 'PLAIN', 'LOGIN' ];
    if (plugin.cfg.main.sysadmin) { methods.push('CRAM-MD5'); }

    connection.capabilities.push('AUTH ' + methods.join(' '));
    connection.notes.allowed_auth_methods = methods;

    return next();
};

exports.check_plain_passwd = function (connection, user, passwd, cb) {
    var plugin = this;

    var chunk_count = 0;
    var auth_success = false;

    var socket = plugin.get_vpopmaild_socket(user);
    socket.setEncoding('utf8');

    socket.on('data', function (chunk) {
        chunk_count++;
        if (chunk_count === 1) {
            if (/^\+OK/.test(chunk)) {
                socket.write("slogin " + user + ' ' + passwd + "\n\r");
                return;
            }
            socket.end();
        }
        if (chunk_count === 2) {
            if (/^\+OK/.test(chunk)) {    // slogin reply
                auth_success = true;
                socket.write("quit\n\r");
            }
            socket.end();             // disconnect
        }
    });
    socket.on('end', function () {
        connection.loginfo(plugin, 'AUTH user="' + user + '" success=' + auth_success);
        return cb(auth_success);
    });
};

exports.get_sock_opts = function (user) {
    var plugin = this;

    plugin.sock_opts = {
        port: 89,
        host: '127.0.0.1',
        sysadmin: undefined,
    };

    var domain = (user.split('@'))[1];
    var sect = plugin.cfg.main;
    if (domain && plugin.cfg[domain]) {
        sect = plugin.cfg[domain];
    }

    if (sect.port)     { plugin.sock_opts.port     = sect.port;     }
    if (sect.host)     { plugin.sock_opts.host     = sect.host;     }
    if (sect.sysadmin) { plugin.sock_opts.sysadmin = sect.sysadmin; }

    plugin.logdebug('sock: ' + plugin.sock_opts.host + ':' + plugin.sock_opts.port);
    return plugin.sock_opts;
};

exports.get_vpopmaild_socket = function (user) {
    var plugin = this;
    plugin.get_sock_opts(user);

    var socket = new net.Socket();
    socket.connect(plugin.sock_opts.port, plugin.sock_opts.host);
    socket.setTimeout(300 * 1000);
    socket.setEncoding('utf8');

    socket.on('timeout', function () {
        plugin.logerror("vpopmaild connection timed out");
        socket.end();
    });
    socket.on('error', function (err) {
        plugin.logerror("vpopmaild connection failed: " + err);
        socket.end();
    });
    socket.on('connect', function () {
        plugin.logdebug('vpopmail connected');
    });
    return socket;
};

exports.get_plain_passwd = function (user, cb) {
    var plugin = this;

    var socket = plugin.get_vpopmaild_socket(user);
    if (!plugin.sock_opts.sysadmin) {
        plugin.logerror("missing sysadmin credentials");
        return cb(null);
    }

    var sys = plugin.sock_opts.sysadmin.split(':');
    var plain_pass = null;
    var chunk_count = 0;

    socket.on('data', function (chunk) {
        chunk_count++;
        plugin.logdebug(chunk_count + '\t' + chunk);
        if (chunk_count === 1) {
            if (/^\+OK/.test(chunk)) {
                socket.write("slogin " + sys[0] + ' ' + sys[1] + "\n\r");
                return;
            }
            plugin.logerror("no ok to start");
            socket.end();             // disconnect
        }
        // slogin reply
        if (chunk_count === 2) {
            if (/^\+OK/.test(chunk)) {
                plugin.logdebug('login success, getting user info');
                socket.write("user_info " + user + "\n\r");
                return;
            }
            plugin.logerror("syadmin login failed");
            socket.end();             // disconnect
        }
        if (chunk_count > 2) {
            if (/^\-ERR/.test(chunk)) {
                plugin.logerror("get_plain failed: " + chunk);
                socket.end();         // disconnect
                return;
            }
            if (!/clear_text_password/.test(chunk)) {
                return;   // pass might be in the next chunk
            }
            var pass = chunk.match(/clear_text_password\s(\S+)\s/);
            plain_pass = pass[1];
            socket.write("quit\n\r");
        }
    });
    socket.on('end', function () {
        cb(plain_pass);
    });
};
