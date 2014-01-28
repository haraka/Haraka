// Auth against vpopmaild

var sock = require('./line_socket');

exports.register = function () {
    this.inherits('auth/auth_base');
}

exports.hook_capabilities = function (next, connection) {
    var config = this.config.get('auth_vpopmaild.ini');
    if (connection.using_tls) {
        var methods = [ 'PLAIN', 'LOGIN' ];
        connection.capabilities.push('AUTH ' + methods.join(' '));
        connection.notes.allowed_auth_methods = methods;
    }
    next();
};

exports.check_plain_passwd = function (connection, user, passwd, cb) {
    this.try_auth_vpopmaild(connection, user, passwd, cb);
}

exports.try_auth_vpopmaild = function (connection, user, passwd, cb) {

    var plugin = this;
    var config = this.config.get('auth_vpopmaild.ini');

    var auth_success = false;
    var result = "";
    var ok_count = 0;

    var socket = new sock.Socket();
    socket.connect( ( config.main.port || 89), (config.main.host || '127.0.0.1') );
    socket.setTimeout(300 * 1000);

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
            // socket.write("quit\n\r"); // DANGER! This returns '+OK'
            socket.end();
        }
    });
    // socket.on('close', function () { });
    socket.on('end', function () {
        connection.loginfo(plugin, 'AUTH user="' + user + '" success=' + auth_success);
        return cb(auth_success);
    });
};

