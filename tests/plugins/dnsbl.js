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
        this.plugin.refresh_config();
        test.equal(true, this.plugin.cfg.main.reject);
        test.equal(30,     this.plugin.cfg.main.periodic_checks);
        test.equal('first', this.plugin.cfg.main.search);
        test.done();
    },
};

exports.get_uniq_zones = {
    setUp : _set_up,
    tearDown : _tear_down,
    'none': function (test) {
        test.expect(1);
        test.equal(undefined, this.plugin.zones);
        test.done();
    },
    'dnsbl.zones': function (test) {
        test.expect(2);
        this.plugin.refresh_config();

        this.plugin.cfg.main.zones = 'dnsbl.test, dnsbl2.test';
        this.plugin.get_uniq_zones();
        test.notEqual(-1, this.plugin.zones.indexOf('dnsbl.test'));
        test.notEqual(-1, this.plugin.zones.indexOf('dnsbl2.test'));

        test.done();
    },
};
