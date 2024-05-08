'use strict';

const assert = require('node:assert')
const path = require('node:path');

const fixtures = require('haraka-test-fixtures');
const Plugin = fixtures.plugin;

const _set_up = (done) => {
    this.plugin = new Plugin('tls')
    this.connection = new fixtures.connection.createConnection();

    // use test/config instead of ./config
    this.plugin.config = this.plugin.config.module_config(path.resolve('test'));
    this.plugin.net_utils.config = this.plugin.net_utils.config.module_config(path.resolve('test'));

    this.plugin.tls_opts = {};
    done();
}

describe('tls', ()=> {
    beforeEach(_set_up)

    it('has function register', () => {
        assert.ok(this.plugin);
        assert.equal('function', typeof this.plugin.register);
    })

    it('has function upgrade_connection', () => {
        assert.equal('function', typeof this.plugin.upgrade_connection);
    })

    it('has function advertise_starttls', () => {
        assert.equal('function', typeof this.plugin.advertise_starttls);
    })

    it('has function emit_upgrade_msg', () => {
        assert.equal('function', typeof this.plugin.emit_upgrade_msg);
    })

    describe('register', ()=> {
        it('with certs, should call register_hook()', () => {
            this.plugin.register();
            assert.ok(this.plugin.register_hook.called);
        })
    })

    describe('emit_upgrade_msg', ()=> {

        it('should emit a log message', () => {
            assert.equal(this.plugin.emit_upgrade_msg(this.connection, true, '', {
                subject: {
                    CN: 'TLS.subject',
                    O: 'TLS.org'
                },
            }),
            'secured: verified=true cn="TLS.subject" organization="TLS.org"');
        })

        it('should emit a log message with error', () => {
            assert.equal(this.plugin.emit_upgrade_msg(this.connection, true, 'oops', {
                subject: {
                    CN: 'TLS.subject',
                    O: 'TLS.org'
                },
            }),
            'secured: verified=true error="oops" cn="TLS.subject" organization="TLS.org"');
        })
    })
})
