'use strict';

var stub         = require('../fixtures/stub'),
    Plugin       = require('../fixtures/stub_plugin'),
    Connection   = require('../fixtures/stub_connection'),
    config       = require('../../config'),
    ResultStore  = require('../../result_store');

var _set_up = function (done) {
    
    this.plugin = new Plugin('clamd');
    this.plugin.config = config;
    this.plugin.register();
    
    this.connection = Connection.createConnection();
    
    this.connection.transaction = {
        notes: {},
        results: new ResultStore(this.plugin),
    };

    done();
};

exports.load_clamd_ini = {
    setUp : _set_up,
    'none': function (test) {
        test.expect(1);
        test.deepEqual([], this.plugin.skip_list);
        test.done();
    },
    'defaults': function (test) {
        test.expect(6);
        var cfg = this.plugin.cfg.main;
        test.equal('localhost:3310', cfg.clamd_socket);
        test.equal(30, cfg.timeout);
        test.equal(10, cfg.connect_timeout);
        test.equal(26214400, cfg.max_size);
        test.equal(false, cfg.only_with_attachments);
        test.equal(false, cfg.randomize_host_order);
        test.done();
    },
};

exports.hook_data = {
    setUp : _set_up,
    'only_with_attachments, false': function (test) {
        test.expect(2);
        test.equal(false, this.plugin.cfg.main.only_with_attachments);
        var next = function () {
            test.equal(undefined, this.connection.transaction.parse_body);
            test.done();
        }.bind(this);
        this.plugin.hook_data(next, this.connection);
    },
    'only_with_attachments, true': function (test) {
        this.plugin.cfg.main.only_with_attachments=true;
        test.expect(2);
        this.connection.transaction.attachment_hooks = function() {};
        var next = function () {
            test.equal(true, this.plugin.cfg.main.only_with_attachments);
            test.equal(true, this.connection.transaction.parse_body);
            test.done();
        }.bind(this);
        this.plugin.hook_data(next, this.connection);
    },
};

exports.hook_data_post = {
    setUp : _set_up,
    'skip attachment': function (test) {
        this.connection.transaction.notes = { clamd_found_attachment: false };
        this.plugin.cfg.main.only_with_attachments=true;
        test.expect(1);
        var next = function () {
            test.ok(this.connection.transaction.results.get('clamd').skip);
            test.done();
        }.bind(this);
        this.plugin.hook_data_post(next, this.connection);
    },
    'message too big': function (test) {
        this.connection.transaction.data_bytes=513;
        this.plugin.cfg.main.max_size=512;
        test.expect(1);
        var next = function () {
            test.ok(this.connection.transaction.results.get('clamd').skip);
            test.done();
        }.bind(this);
        this.plugin.hook_data_post(next, this.connection);
    },
};
