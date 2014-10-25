
var stub         = require('../fixtures/stub'),
    Plugin       = require('../fixtures/stub_plugin'),
    configfile   = require('../../configfile'),
    config       = require('../../config');

function _set_up(callback) {
    this.backup = {};

    // needed for tests
    this.plugin = Plugin('clamd');
    this.plugin.config = config;

    this.plugin.loginfo = stub();

    callback();
}

function _tear_down(callback) {
    callback();
}

exports.load_clamd_ini = {
    setUp : _set_up,
    tearDown : _tear_down,
    'none': function (test) {
        test.expect(1);
        test.equal(undefined, this.plugin.cfg);
        test.done();
    },
    'defaults': function (test) {
        test.expect(6);
        this.plugin.load_clamd_ini();
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
