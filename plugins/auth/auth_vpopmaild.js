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

    var socket = new sock.Socket();
    socket.connect( ( config.main.port || 89), (config.main.host || '127.0.0.1') );
    socket.setTimeout(300 * 1000);

    socket.on('timeout', function () {
        connection.logerror(plugin, "vpopmaild connection timed out");
        socket.end();
    });
    socket.on('error', function (err) {
        connection.logerror(plugin, "vpopmaild connection failed: " + err);
    });
    socket.on('connect', function () {
       socket.write("login " + user + ' ' + passwd + "\n\r");
    });
    socket.on('line', function (line) {
        connection.logprotocol(plugin, 'C:' + line);
        if (line.match(/^\+OK/)) {
	    auth_success = true;
        }
        if ( line.match(/^\./) )
            socket.end();
    });
    socket.on('close', function () {
        connection.loginfo(plugin, 'AUTH user="' + user + '" success=' + auth_success);
        return cb(auth_success);
    });
    socket.on('end', function () {
//      return cb(auth_success);
    });
};

