'use strict';
const assert = require('node:assert')
const dns = require('node:dns');

const fixtures  = require('haraka-test-fixtures');
const Address   = require('address-rfc2821').Address

const _set_up = (done) => {

    this.plugin = new fixtures.plugin('mail_from.is_resolvable');
    this.plugin.register();

    this.connection = fixtures.connection.createConnection();
    this.connection.init_transaction()

    done();
}

describe('mail_from.is_resolvable', () => {
    beforeEach(_set_up)

    describe('hook_mail', () => {
        it('any.com, no err code', (done) => {
            const txn = this.connection.transaction;
            this.plugin.hook_mail((code, msg) => {
                // console.log()
                assert.deepEqual(txn.results.get('mail_from.is_resolvable').pass, ['has_fwd_dns']);
                done();
            },
            this.connection, 
            [new Address('<test@any.com>')]
            )
        })
    })
})
