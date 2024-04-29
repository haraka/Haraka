'use strict';

const assert = require('node:assert')
const path = require('node:path');

const fixtures = require('haraka-test-fixtures');

const _set_up = (done) => {
    this.backup = {};

    this.plugin = new fixtures.plugin('auth/auth_vpopmaild');
    this.plugin.inherits('auth/auth_base');

    // reset the config/root_path
    this.plugin.config.root_path = path.resolve(__dirname, '../../../config');
    this.plugin.cfg = this.plugin.config.get('auth_vpopmaild.ini');

    this.connection = fixtures.connection.createConnection();
    this.connection.capabilities=null;

    done();
}

describe('hook_capabilities', () => {
    beforeEach(_set_up)

    it('no TLS', (done) => {
        this.plugin.hook_capabilities((rc, msg) => {
            assert.equal(undefined, rc);
            assert.equal(undefined, msg);
            assert.equal(null, this.connection.capabilities);
            done();
        }, this.connection);
    })

    it('with TLS', (done) => {
        this.connection.tls.enabled=true;
        this.connection.capabilities=[];
        this.plugin.hook_capabilities((rc, msg) => {
            assert.equal(undefined, rc);
            assert.equal(undefined, msg);
            assert.ok(this.connection.capabilities.length);
            done();
        }, this.connection);
    })

    it('with TLS, sysadmin', (done) => {
        this.connection.tls.enabled=true;
        this.connection.capabilities=[];
        this.plugin.hook_capabilities((rc, msg) => {
            assert.equal(undefined, rc);
            assert.equal(undefined, msg);
            assert.ok(this.connection.capabilities.length);
            done();
        }, this.connection);
    })
})

describe('get_vpopmaild_socket', () => {
    beforeEach(_set_up)

    it('any', () => {
        const socket = this.plugin.get_vpopmaild_socket('foo@localhost.com');
        assert.ok(socket);
        socket.end();
    })
})

describe('get_plain_passwd', () => {
    beforeEach(_set_up)

    it('matt@example.com', (done) => {
        if (this.plugin.cfg['example.com'].sysadmin) {
            this.plugin.get_plain_passwd('matt@example.com', (pass) => {
                assert.ok(pass);
                done();
            });
        }
        else {
            done();
        }
    })
})
