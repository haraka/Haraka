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
};

exports.options_to_object = {
    setUp : _set_up,
    'converts string to object': function (test) {
        test.expect(3);
        var expected = {'.gz':true,'.zip':true};
        test.deepEqual(expected, this.plugin.options_to_object('gz zip'));
        test.deepEqual(expected, this.plugin.options_to_object('gz,zip'));
        test.deepEqual(expected, this.plugin.options_to_object(' gz , zip '));
        test.done();
    },
};

/* jshint maxlen: 100 */
exports.load_dissallowed_extns = {
    setUp : _set_up,
    'loads comma separated options': function (test) {
        test.expect(2);
        this.plugin.cfg = { main: { disallowed_extensions: 'exe,scr' } };
        this.plugin.load_dissallowed_extns();

        test.ok(this.plugin.re.bad_extn);
        test.ok(this.plugin.re.bad_extn.test('bad.scr'));
        test.done();
    },
    'loads space separated options': function (test) {
        test.expect(2);
        this.plugin.cfg = { main: { disallowed_extensions: 'dll tnef' } };
        this.plugin.load_dissallowed_extns();
        test.ok(this.plugin.re.bad_extn);
        test.ok(this.plugin.re.bad_extn.test('bad.dll'));
        test.done();
    },
};

exports.dissallowed_extns = {
    setUp : _set_up,
    'attachment_files': function (test) {
        test.expect(2);
        this.plugin.cfg = { main: { disallowed_extensions: 'exe;scr' } };
        this.plugin.load_dissallowed_extns();

        var txn = this.connection.transaction;
        txn.notes.attachment_files = ['naughty.exe'];
        test.equal('exe', this.plugin.disallowed_extensions(txn));

        txn.notes.attachment_files = ['good.pdf', 'naughty.exe'];
        test.equal('exe', this.plugin.disallowed_extensions(txn));
        test.done();
    },
    'attachment_archive_files': function (test) {
        test.expect(3);
        this.plugin.cfg = { main: { disallowed_extensions: 'dll tnef' } };
        this.plugin.load_dissallowed_extns();

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

exports.load_n_compile_re = {
    setUp : _set_up,
    'loads regex lines from file, compiles to array': function (test) {
        test.expect(2);

        this.plugin.load_n_compile_re('test', 'attachment.filename.regex');
        test.ok(this.plugin.re.test);
        test.ok(this.plugin.re.test[0].test('foo.exe'));

        test.done();
    },
};

exports.check_items_against_regexps = {
    setUp : _set_up,
    'positive': function (test) {
        test.expect(2);
        this.plugin.load_n_compile_re('test', 'attachment.filename.regex');

        test.ok(this.plugin.check_items_against_regexps(
                    ['file.exe'], this.plugin.re.test));
        test.ok(this.plugin.check_items_against_regexps(
                    ['fine.pdf','awful.exe'], this.plugin.re.test));

        test.done();
    },
    'negative': function (test) {
        test.expect(2);
        this.plugin.load_n_compile_re('test', 'attachment.filename.regex');

        test.ok(!this.plugin.check_items_against_regexps(
                    ['file.png'], this.plugin.re.test));
        test.ok(!this.plugin.check_items_against_regexps(
                    ['fine.pdf','godiva.chocolate'], this.plugin.re.test));

        test.done();
    },
};
