'use strict';

var stub             = require('../fixtures/stub');
var Connection       = require('../fixtures/stub_connection');
var Plugin           = require('../fixtures/stub_plugin');
var config           = require('../../config');
var ResultStore      = require("../../result_store");

var _set_up = function (done) {
    
    this.plugin = new Plugin('attachment');

    this.plugin.config = config;
    this.plugin.cfg = { main: {} };

    this.connection = Connection.createConnection();

    this.connection.transaction = stub;
    this.connection.transaction.results = new ResultStore(this.plugin);
    this.connection.transaction.notes = {};

    done();
};

exports.attachment_ini = {
    setUp : _set_up,
    'load config': function (test) {
        test.expect(2);
        this.plugin.load_attachment_ini();
        test.ok(this.plugin.cfg.archive.max_depth);
        test.ok(this.plugin.cfg.archive.exts);
        // console.log(this.plugin.cfg.archive.exts);
        test.done();
    },
    'options_to_object': function (test) {
        test.expect(1);
        test.deepEqual(
            {'.gz':true,'.zip':true}, 
            this.plugin.options_to_object('gz zip')
        );
        test.done();
    },
};

/* jshint maxlen: 100 */
exports.load_dissallowed_extns = {
    setUp : _set_up,
    'loads comma separated options': function (test) {
        test.expect(3);
        // setup
        this.plugin.cfg = { main: { disallowed_extensions: 'exe,scr' } };

        this.plugin.load_dissallowed_extns();
        test.ok(this.plugin.re.bad_extn);

        var txn = this.connection.transaction;
        txn.notes.attachment_files = ['naughty.exe'];
        test.equal('exe', this.plugin.disallowed_extensions(txn));

        txn.notes.attachment_files = ['good.pdf', 'naughty.exe'];
        test.equal('exe', this.plugin.disallowed_extensions(txn));
        test.done();
    },
    'loads space separated options': function (test) {
        test.expect(4);
        this.plugin.cfg = { main: { disallowed_extensions: 'dll tnef' } };

        this.plugin.load_dissallowed_extns();
        test.ok(this.plugin.re.bad_extn);

        var txn = this.connection.transaction;
        txn.notes.attachment_archive_files = ['icky.tnef'];
        test.equal('tnef', this.plugin.disallowed_extensions(txn));

        txn.notes.attachment_archive_files = ['good.pdf', 'naughty.dll'];
        test.equal('dll', this.plugin.disallowed_extensions(txn));

        txn.notes.attachment_archive_files = ['good.pdf', 'better.png'];
        test.equal(false, this.plugin.disallowed_extensions(txn));
        test.done();
    },
};
