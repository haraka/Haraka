var Plugin       = require('../fixtures/stub_plugin'),
    Connection   = require('../fixtures/stub_connection'),
    configfile   = require('../../configfile'),
    config       = require('../../config'),
    constants    = require('../../constants');

constants.import(global);

function _set_up(callback) {
    this.backup = {};

    this.plugin = Plugin('early_talker');
    this.plugin.config = config;

    this.connection = Connection.createConnection();
    callback();
}

function _tear_down(callback) { callback(); }

exports.early_talker = {
    setUp : _set_up,
    tearDown : _tear_down,
    'no config': function (test) {
        test.expect(2);
        var next = function (rc, msg) {
            test.equal(undefined, rc);
            test.equal(undefined, msg);
            test.done();
        }.bind(this);
        this.plugin.early_talker(next, this.connection);
    },
    'relaying': function (test) {
        test.expect(2);
        var next = function (rc, msg) {
            test.equal(undefined, rc);
            test.equal(undefined, msg);
            test.done();
        }.bind(this);
        this.plugin.pause = 1;
        this.connection.relaying = true;
        this.plugin.early_talker(next, this.connection);
    },
    'is an early talker': function (test) {
        test.expect(3);
        var before = Date.now();
        var next = function (rc, msg) {
            test.ok(Date.now() >= before + 1000);
            test.equal(DENYDISCONNECT, rc);
            test.equal('You talk too soon', msg);
            test.done();
        }.bind(this);
        this.plugin.pause = 1000;
        this.connection.early_talker = true;
        this.plugin.early_talker(next, this.connection);
    },
};
