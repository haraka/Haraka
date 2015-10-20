var stub         = require('./fixtures/stub');
var constants    = require('./../constants');
// var Logger       = require('./fixtures/stub_logger');
var configfile   = require('./../configfile');
var config       = require('./../config');
var config       = require('./../config');
// var ResultStore  = require('../../result_store');
var config       = require('./../config');
var connection   = require('./../connection');

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
    'queue_msg, defined' : function (test) {
        test.expect(1);
        test.equal(
                'test message',
                this.connection.queue_msg(1, 'test message')
                );
        test.done();
    },
    'queue_msg, default deny' : function (test) {
        test.expect(2);
        test.equal(
                'Message denied',
                this.connection.queue_msg(DENY)
                );
        test.equal(
                'Message denied',
                this.connection.queue_msg(DENYDISCONNECT)
                );
        test.done();
    },
    'queue_msg, default denysoft' : function (test) {
        test.expect(2);
        test.equal(
                'Message denied temporarily',
                this.connection.queue_msg(DENYSOFT)
                );
        test.equal(
                'Message denied temporarily',
                this.connection.queue_msg(DENYSOFTDISCONNECT)
                );
        test.done();
    },
    'queue_msg, default else' : function (test) {
        test.expect(1);
        test.equal('', this.connection.queue_msg('hello'));
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
