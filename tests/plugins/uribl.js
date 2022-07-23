'use strict';

const path      = require('path');
const fixtures  = require('haraka-test-fixtures');

const _set_up = function (done) {

    this.plugin = new fixtures.plugin('data.uribl');
    this.plugin.config.root_path = path.resolve(__dirname, '../../config');

    this.plugin.register();

    this.connection = fixtures.connection.createConnection();
    this.connection.transaction = fixtures.transaction.createTransaction()

    done();
}

exports.do_lookups = {
    setUp : _set_up,
    'lookup_test_ip: 127.0.0.2' (test) {
        test.expect(2);
        this.plugin.do_lookups(this.connection, (code, msg) => {
            // no result b/c private IP
            test.equal(code, undefined)
            test.equal(msg, undefined)
            test.done()
        }, ['127.0.0.2'], 'body')
    },
    'lookup_test_ip: test.uribl.com' (test) {
        test.expect(2);
        this.plugin.do_lookups(this.connection, (code, msg) => {
            test.equal(code, undefined)
            test.equal(msg, undefined)
            test.done()
        }, ['test.uribl.com'], 'body')
    },
}

exports.lookup_remote_ip = {
    setUp : _set_up,
    'lookup_remote_ip: 66.128.51.165' (test) {
        test.expect(2);
        this.connection.remote.ip = '66.128.51.165'
        this.plugin.lookup_remote_ip((code, msg) => {
            test.equal(code, undefined)
            test.equal(msg, undefined)
            // console.log(`test, code: ${code}, msg: ${msg}`)
            test.done()
        }, this.connection)
    },
}

