'use strict';

const fixtures = require('haraka-test-fixtures');
const path = require("path");


const Connection   = fixtures.connection;

function _set_up (done) {

    this.plugin = new fixtures.plugin('attachment');
    this.plugin.cfg = {};
    this.plugin.cfg.timeout = 10;

    this.connection = Connection.createConnection();
    this.connection.init_transaction();

    this.connection.logdebug = function (where, message) { console.log(message); };
    this.connection.loginfo = function (where, message) { console.log(message); };

    this.directory = path.resolve(__dirname, '../attachment');

    // we need find bsdtar
    this.plugin.register();

    // we need find bsdtar
    this.plugin.hook_init_master(done);
}

exports.unarchive = {
    setUp : _set_up,
    '3layers' (test) {
        this.plugin.unarchive_recursive(this.connection, `${this.directory}/3layer.zip`, '3layer.zip', (e, files) => {
            test.expect(2);
            test.equals(e, null);
            test.equals(files.length, 3);
            test.done();
        });
    },
    'empty.gz' (test) {
        this.plugin.unarchive_recursive(this.connection, `${this.directory}/empty.gz`, 'empty.gz', (e, files) => {
            test.expect(2);
            test.equals(e, null);
            test.equals(files.length, 0);
            test.done();
        });
    },
    'encrypt.zip' (test) {
        this.plugin.unarchive_recursive(this.connection, `${this.directory}/encrypt.zip`, 'encrypt.zip', (e, files) => {
            // we see files list in encrypted zip, but we can't extract so no error here
            test.expect(2);
            test.equals(e, null);
            test.equals(files.length, 1);
            test.done();
        });
    },
    'encrypt-recursive.zip' (test) {
        this.plugin.unarchive_recursive(this.connection, `${this.directory}/encrypt-recursive.zip`, 'encrypt-recursive.zip', (e, files) => {
            // we can't extract encrypted file in encrypted zip so error here
            test.expect(2);
            test.equals(true, e.message.includes('encrypted'));
            test.equals(files.length, 1);
            test.done();
        });
    },
    'gz-in-zip.zip' (test) {
        this.plugin.unarchive_recursive(this.connection, `${this.directory}/gz-in-zip.zip`, 'gz-in-zip.zip', (e, files) => {
            // gz is not listable in bsdtar
            test.expect(2);
            test.equals(e, null);
            test.equals(files.length, 1);
            test.done();
        });
    },
    'invalid.zip' (test) {
        this.plugin.unarchive_recursive(this.connection, `${this.directory}/invalid.zip`, 'invalid.zip', (e, files) => {
            // invalid zip is assumed to be just file, so error of bsdtar is ignored
            test.expect(2);
            test.equals(e, null);
            test.equals(files.length, 0);
            test.done();
        });
    },
    'invalid-in-valid.zip' (test) {
        this.plugin.unarchive_recursive(this.connection, `${this.directory}/invalid-in-valid.zip`, 'invalid-in-valid.zip', (e, files) => {
            test.expect(2);
            test.equals(e, null);
            test.equals(files.length, 1);
            test.done();
        });
    },
    'password.zip' (test) {
        this.plugin.unarchive_recursive(this.connection, `${this.directory}/password.zip`, 'password.zip', (e, files) => {
            // we see files list in encrypted zip, but we can't extract so no error here
            test.expect(2);
            test.equals(e, null);
            test.equals(files.length, 1);
            test.done();
        });
    },
    'valid.zip' (test) {
        this.plugin.unarchive_recursive(this.connection, `${this.directory}/valid.zip`, 'valid.zip', (e, files) => {
            test.expect(2);
            test.equals(e, null);
            test.equals(files.length, 1);
            test.done();
        });
    },
    'timeout' (test) {
        this.plugin.cfg.timeout = 0;
        this.plugin.unarchive_recursive(this.connection, `${this.directory}/encrypt-recursive.zip`, 'encrypt-recursive.zip', (e, files) => {
            test.expect(2);
            test.ok(true, e.message.includes('timeout'));
            test.equals(files.length, 0);
            test.done();
        });
    },
}
