var stub             = require('../fixtures/stub'),
//  constants        = require('../../constants'),
    Connection       = require('../fixtures/stub_connection'),
    Plugin           = require('../fixtures/stub_plugin');

// huge hack here, but plugin tests need constants
// constants.import(global);

function _set_up(callback) {
    this.backup = {};

    // needed for tests
    this.plugin = Plugin('relay_acl');
    this.connection = Connection.createConnection();

    // going to need these in multiple tests
    // this.plugin.register();

    callback();
}

function _tear_down(callback) {
    callback();
}

exports.is_acl_allowed = {
    setUp : _set_up,
    tearDown : _tear_down,
    'bare IP' : function (test) {
        test.expect(3);
        this.plugin.acl_allow=['127.0.0.6'];
        test.equal(true, this.plugin.is_acl_allowed(this.connection, '127.0.0.6'));
        test.equal(false, this.plugin.is_acl_allowed(this.connection, '127.0.0.5'));
        test.equal(false, this.plugin.is_acl_allowed(this.connection, '127.0.1.5'));
        test.done();
    },
    'netmask' : function (test) {
        test.expect(3);
        this.plugin.acl_allow=['127.0.0.6/24'];
        test.equal(true, this.plugin.is_acl_allowed(this.connection, '127.0.0.6'));
        test.equal(true, this.plugin.is_acl_allowed(this.connection, '127.0.0.5'));
        test.equal(false, this.plugin.is_acl_allowed(this.connection, '127.0.1.5'));
        test.done();
    },
};
