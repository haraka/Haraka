var stub         = require('./fixtures/stub'),
    constants    = require('./../constants'),
//  Logger       = require('./fixtures/stub_logger'),
    configfile   = require('./../configfile'),
    config       = require('./../config'),
//  ResultStore  = require('../../result_store'),
    connection   = require('./../connection');

// huge hack here, but plugin tests need constants
constants.import(global);

function _set_up(callback) {
    this.backup = {};
    var client = {
        destroy: function () { var foo = 1; }
    };
    this.connection = connection.createConnection(client, {});  // this.server);
    callback();
}

function _tear_down(callback) {
    callback();
}

exports.connection = {
    setUp : _set_up,
    tearDown : _tear_down,
    'get_capabilities' : function (test) {
        test.expect(1);
// console.log(this);
        test.deepEqual([], this.connection.get_capabilities());
        test.done();
    },
    /*
    'max_data_exceeded_respond' : function (test) {
        test.expect(1);
        test.ok(this.connection.max_data_exceeded_respond(DENYSOFT, 'test' ));
        test.done();
    }
    */
};
