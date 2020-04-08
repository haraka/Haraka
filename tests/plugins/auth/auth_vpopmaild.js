'use strict';

const path         = require('path');

const fixtures     = require('haraka-test-fixtures');

function _set_up (done) {
    this.backup = {};

    // needed for tests
    this.plugin = new fixtures.plugin('auth/auth_vpopmaild');
    this.plugin.inherits('auth/auth_base');
    // reset the config/root_path
    this.plugin.config.root_path = path.resolve(__dirname, '../../../config');
    this.plugin.cfg = this.plugin.config.get('auth_vpopmaild.ini');

    this.connection = fixtures.connection.createConnection();
    this.connection.capabilities=null;

    done();
}

exports.hook_capabilities = {
    setUp : _set_up,
    'no TLS' (test) {
        const cb = function (rc, msg) {
            test.expect(3);
            test.equal(undefined, rc);
            test.equal(undefined, msg);
            test.equal(null, this.connection.capabilities);
            test.done();
        }.bind(this);
        this.plugin.hook_capabilities(cb, this.connection);
    },
    'with TLS' (test) {
        const cb = function (rc, msg) {
            test.expect(3);
            test.equal(undefined, rc);
            test.equal(undefined, msg);
            test.ok(this.connection.capabilities.length);
            // console.log(this.connection.capabilities);
            test.done();
        }.bind(this);
        this.connection.tls.enabled=true;
        this.connection.capabilities=[];
        this.plugin.hook_capabilities(cb, this.connection);
    },
    'with TLS, sysadmin' (test) {
        const cb = function (rc, msg) {
            test.expect(3);
            test.equal(undefined, rc);
            test.equal(undefined, msg);
            test.ok(this.connection.capabilities.length);
            // console.log(this.connection.capabilities);
            test.done();
        }.bind(this);
        this.connection.tls.enabled=true;
        this.connection.capabilities=[];
        this.plugin.hook_capabilities(cb, this.connection);
    },
}

exports.get_vpopmaild_socket = {
    setUp : _set_up,
    'any' (test) {
        test.expect(1);
        const socket = this.plugin.get_vpopmaild_socket('foo@localhost.com');
        // console.log(socket);
        test.ok(socket);
        socket.end();
        test.done();
    }
}

exports.get_plain_passwd = {
    setUp : _set_up,
    'matt@example.com' (test) {
        function cb (pass) {
            test.expect(1);
            test.ok(pass);
            test.done();
        }
        if (this.plugin.cfg['example.com'].sysadmin) {
            this.plugin.get_plain_passwd('matt@example.com', cb);
        }
        else {
            test.expect(0);
            test.done();
        }
    }
}
