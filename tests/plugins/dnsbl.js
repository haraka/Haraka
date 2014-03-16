var stub         = require('../fixtures/stub'),
    Plugin       = require('../fixtures/stub_plugin'),
    configfile   = require('../../configfile'),
    config       = require('../../config');

function _set_up(callback) {
    this.backup = {};

    // needed for tests
    this.plugin = Plugin('dnsbl');
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
        test.expect(3);
        var r = this.plugin.refresh_config();
        test.equal(true, r.main.reject);
        test.equal(30, r.main.periodic_checks);
        test.equal('first', r.main.search);
        // test.deepEqual([], r.main.zones);
        test.done();
    },
};
