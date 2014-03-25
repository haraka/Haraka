
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

exports.refresh_config = {
    setUp : _set_up,
    tearDown : _tear_down,
    'none': function (test) {
        test.expect(1);
        test.equal(undefined, this.plugin.cfg);
        test.done();
    },
    'defaults': function (test) {
        test.expect(12);
        var r = this.plugin.refresh_config();
        // console.log(r);
        test.equal('localhost:3310', r.main.clamd_socket);
        test.equal(30, r.main.timeout);
        test.equal(10, r.main.connect_timeout);
        test.equal(26214400, r.main.max_size);
        test.equal(false, r.main.only_with_attachments);
        test.equal(false, r.main.randomize_host_order);

        test.equal('localhost:3310', this.plugin.cfg.main.clamd_socket);
        test.equal(30, this.plugin.cfg.main.timeout);
        test.equal(10, this.plugin.cfg.main.connect_timeout);
        test.equal(26214400, this.plugin.cfg.main.max_size);
        test.equal(false, this.plugin.cfg.main.only_with_attachments);
        test.equal(false, this.plugin.cfg.main.randomize_host_order);
        test.done();
    },
};
