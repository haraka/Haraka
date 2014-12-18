'use strict';

var cfreader = require('../../configfile');
var regex = cfreader.regex;

var _set_up = function (done) {
    this.flat = require('../../cfreader/flat');
    done();
};
var _tear_down = function (done) {
    done();
};

exports.load = {
    setUp : _set_up,
    tearDown : _tear_down,
    'module is required' : function (test) {
        test.expect(1);
        test.ok(this.flat);
        test.done();
    },
    'has a load function': function(test) {
    	test.expect(1);
    	test.ok(typeof this.flat.load === 'function');
    	test.done();
    },
    'returns null for non-existing files': function(test) {
    	test.expect(1);
    	var result = this.flat.load('tests/config/non-existent.flat');
    	test.equal(result, null);
    	test.done();
    },
    'loads the test flat file, as list': function(test) {
    	test.expect(1);
    	var result = this.flat.load(
            'tests/config/test.flat', 'list', null, regex);
        test.deepEqual(result, [ 'line1', 'line2', 'line3', 'line5' ]);
    	test.done();
    },
    'loads the test flat file, unspecified type': function(test) {
        test.expect(1);
        var result = this.flat.load(
            'tests/config/test.flat', null, null, regex);
        test.deepEqual(result, 'line1');
        test.done();
    },
};