require('../configfile').watch_files = false;

var tls_socket = require('../tls_socket');

exports.tls_socket = {
    'loads' : function (test) {
        test.expect(1);
        test.ok(tls_socket);
        test.done();
    },
    'exports createConnection' : function (test) {
        test.expect(1);
        test.equal(typeof tls_socket.createConnection, 'function');
        test.done();
    },
    'exports createServer' : function (test) {
        test.expect(1);
        // console.log(tls_socket);
        test.equal(typeof tls_socket.createServer, 'function');
        test.done();
    },
    'exports shutdown' : function (test) {
        test.expect(1);
        // console.log(tls_socket);
        test.equal(typeof tls_socket.shutdown, 'function');
        test.done();
    },
}

exports.createServer = {
    'returns a net.Server' : function (test) {
        test.expect(1);
        var server = tls_socket.createServer(function (socket) {
            // console.log(socket);
        });
        test.ok(server);
        test.done();
    }
}