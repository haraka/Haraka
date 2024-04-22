'use strict';

const fixtures  = require('haraka-test-fixtures');
const dns       = require('dns');
const Address   = require('address-rfc2821').Address

const _set_up = function (done) {

    this.plugin = new fixtures.plugin('mail_from.is_resolvable');
    this.plugin.register();

    this.connection = fixtures.connection.createConnection();
    this.connection.init_transaction()

    done();
}

exports.hook_mail = {
    setUp : _set_up,
    'any.com, no err code' (test) {
        test.expect(1);
        const txn = this.connection.transaction;
        this.plugin.hook_mail((code, msg) => {
            console.log()
            test.deepEqual(txn.results.get('mail_from.is_resolvable').pass, ['has_fwd_dns']);
            test.done();
        },
        this.connection, 
        [new Address('<test@any.com>')]
        );
    },
}
