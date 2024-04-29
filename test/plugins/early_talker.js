'use strict';
const assert = require('node:assert')

const fixtures     = require('haraka-test-fixtures');

const _set_up = (done) => {
    this.plugin = new fixtures.plugin('early_talker');
    this.plugin.cfg = { main: { reject: true } };

    this.connection = fixtures.connection.createConnection();
    done();
}

describe('early_talker', () => {
    beforeEach(_set_up)

    it('no config', (done) => {
        this.plugin.early_talker((rc, msg) => {
            assert.equal(rc, undefined);
            assert.equal(msg, undefined);
            done();
        }, this.connection);
    })

    it('relaying', (done) => {
        this.plugin.pause = 1;
        this.connection.relaying = true;
        this.plugin.early_talker((rc, msg) => {
            assert.equal(rc, undefined);
            assert.equal(msg, undefined);
            done();
        }, this.connection);
    })

    it('is an early talker', (done) => {
        const before = Date.now();
        this.plugin.pause = 1001;
        this.connection.early_talker = true;
        this.plugin.early_talker((rc, msg) => {
            assert.ok(Date.now() >= before + 1000);
            assert.equal(rc, DENYDISCONNECT);
            assert.equal(msg, 'You talk too soon');
            done();
        }, this.connection);
    })

    it('is an early talker, reject=false', (done) => {
        const before = Date.now();
        this.plugin.pause = 1001;
        this.plugin.cfg.main.reject = false;
        this.connection.early_talker = true;
        this.plugin.early_talker((rc, msg) => {
            assert.ok(Date.now() >= before + 1000);
            assert.equal(undefined, rc);
            assert.equal(undefined, msg);
            assert.ok(this.connection.results.has('early_talker', 'fail', 'early'));
            done();
        }, this.connection);
    })

    it('relay whitelisted ip', (done) => {
        this.plugin.pause = 1000;
        this.plugin.whitelist = this.plugin.load_ip_list(['127.0.0.1']);
        this.connection.remote.ip = '127.0.0.1';
        this.connection.early_talker = true;
        this.plugin.early_talker((rc, msg) => {
            assert.equal(undefined, rc);
            assert.equal(undefined, msg);
            assert.ok(this.connection.results.has('early_talker', 'skip', 'whitelist'));
            done();
        }, this.connection);
    })

    it('relay whitelisted subnet', (done) => {
        this.plugin.pause = 1000;
        this.plugin.whitelist = this.plugin.load_ip_list(['127.0.0.0/16']);
        this.connection.remote.ip = '127.0.0.88';
        this.connection.early_talker = true;
        this.plugin.early_talker((rc, msg) => {
            assert.equal(undefined, rc);
            assert.equal(undefined, msg);
            assert.ok(this.connection.results.has('early_talker', 'skip', 'whitelist'));
            done();
        }, this.connection);
    })

    it('relay good senders', (done) => {
        this.plugin.pause = 1000;
        this.connection.results.add('karma', {good: 10});
        this.connection.early_talker = true;
        this.plugin.early_talker((rc, msg) => {
            assert.equal(undefined, rc);
            assert.equal(undefined, msg);
            assert.ok(this.connection.results.has('early_talker', 'skip', '+karma'));
            done();
        }, this.connection);
    })

    it('test loading ip list', () => {
        const whitelist = this.plugin.load_ip_list(['123.123.123.123', '127.0.0.0/16']);
        assert.equal(whitelist[0][1], 32);
        assert.equal(whitelist[1][1], 16);
    })
})
