// require('../configfile').watch_files = false;

const path = require('path');

function _setup (done) {
    const socket = require('../tls_socket');
    this.socket = socket;

    // use tests/config instead of ./config
    this.socket.config = this.socket.config.module_config(path.resolve('tests'));
    this.socket.net_utils.config = this.socket.config;

    done();
}

exports.tls_socket = {
    setUp: _setup,
    'loads' : function (test) {
        test.expect(1);
        test.ok(this.socket);
        test.done();
    },
    'exports createConnection' : function (test) {
        test.expect(1);
        test.equal(typeof this.socket.createConnection, 'function');
        test.done();
    },
    'exports createServer' : function (test) {
        test.expect(1);
        // console.log(this.socket);
        test.equal(typeof this.socket.createServer, 'function');
        test.done();
    },
    // 'exports shutdown' : function (test) {
    //     test.expect(1);
    //     // console.log(this.socket);
    //     test.equal(typeof this.socket.shutdown, 'function');
    //     test.done();
    // },
}

exports.createServer = {
    setUp: _setup,
    'returns a net.Server' : function (test) {
        test.expect(1);
        var server = this.socket.createServer(socket => {
            console.log(socket);
        });
        test.ok(server);
        test.done();
    }
}

exports.saveOpt = {
    setUp: _setup,
    'saveOpt': function (test) {
        test.expect(1);
        this.socket.saveOpt('*', 'dhparam', new Buffer('from a string'));
        test.ok(this.socket.certsByHost['*'].dhparam);
        // console.log(this.socket.certsByHost['*']);
        test.done();
    }
}

exports.load_tls_ini = {
    setUp: _setup,
    'tls.ini loads': function (test) {
        test.expect(2);
        test.ok(this.socket.load_tls_ini().main !== undefined);
        test.ok(this.socket.certsByHost['*'].key);
        // console.log(this.socket.cfg);
        // console.log(this.socket.certsByHost);
        test.done();
    },
}

exports.get_certs_dir = {
    setUp: _setup,
    'loads certs from config/tls': function (test) {
        test.expect(2);
        this.socket.get_certs_dir('tls', function (err, certs) {
            test.ifError(err);
            // console.error(certs);
            test.ok(certs);
            test.done();
        })
    }
}

exports.getSocketOpts = {
    setUp: _setup,
    'gets socket opts for *': function (test) {
        test.expect(2);
        this.socket.get_certs_dir('tls', () => {
            this.socket.getSocketOpts('*', (opts) => {
                // console.log(opts);
                test.ok(opts.key);
                test.ok(opts.cert);
                test.done();
            })
        })
    },
}
