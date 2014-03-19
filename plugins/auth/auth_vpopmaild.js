// Auth against vpopmaild

var sock = require('./line_socket');
var cfg;

exports.register = function () {
    this.inherits('auth/auth_base');
};

exports.hook_capabilities = function (next, connection) {
    if (!connection.using_tls) return next();

    var methods = [ 'PLAIN', 'LOGIN' ];
    connection.capabilities.push('AUTH ' + methods.join(' '));
    connection.notes.allowed_auth_methods = methods;

    return next();
};

exports.check_plain_passwd = function (connection, user, passwd, cb) {
    this.try_auth_vpopmaild(connection, user, passwd, cb);
};

exports.try_auth_vpopmaild = function (connection, user, passwd, cb) {
    var plugin = this;
    cfg = plugin.config.get(plugin.name + '.ini');

    var auth_success = false;
    var result = "";
    var ok_count = 0;
    var port = 89;
    var host = '127.0.0.1';

    var domain = (user.split('@'))[1];
    if (domain && cfg[domain]) {
	if (cfg[domain].port) port = cfg[domain].port;
	if (cfg[domain].host) host = cfg[domain].host;
    }
    else {
	if (cfg.main.port) port = cfg.main.port;
	if (cfg.main.host) host = cfg.main.host;
    }

    var socket = new sock.Socket().connect(port, host).setTimeout(300 * 1000);

    socket.on('timeout', function () {
        connection.logerror(plugin, "vpopmaild connection timed out");
        socket.end();
    });
    socket.on('error', function (err) {
        connection.logerror(plugin, "vpopmaild connection failed: " + err);
        socket.end();
    });
    socket.on('connect', function () {
        // wait for server to send us +OK vvvvv
    });
    socket.on('line', function (line) {
        if (line.match(/^\+OK/)) {    // default server response: +OK
            ok_count++;
            if (ok_count === 1) {     // first OK is just a 'ready'
                socket.write("slogin " + user + ' ' + passwd + "\n\r");
            }
            if (ok_count === 2) {     // second OK is response to slogin
                auth_success = true;
                socket.write("quit\n\r");
            }
        }
        if (line.match(/^\-ERR/)) {   // auth failed
            // DANGER, do not say 'goodbye' to the server with "quit\n\r". The
            // server will respond '+OK', which could be mis-interpreted as an
            // auth response.
            socket.end();             // disconnect
        }
    });
    socket.on('end', function () {
        connection.loginfo(plugin, 'AUTH user="' + user + '" success=' + auth_success);
        return cb(auth_success);
    });
};

