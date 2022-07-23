'use strict';

const path      = require('path');
const fixtures  = require('haraka-test-fixtures');
// const ipaddr    = require('ipaddr.js');

const _set_up = function (done) {

    this.plugin = new fixtures.plugin('data.uribl');
    this.plugin.config.root_path = path.resolve(__dirname, '../../config');

    this.plugin.register();

    this.connection = fixtures.connection.createConnection();
    this.connection.transaction = fixtures.transaction.createTransaction()

    // console.log(this.plugin)
    done();
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
