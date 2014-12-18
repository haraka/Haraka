'use strict';

var _set_up = function (done) {
    this.json = require('../../cfreader/json');
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
        test.ok(this.json);
        test.done();
    },
    'has a load function': function(test) {
    	test.expect(1);
    	test.ok(typeof this.json.load === 'function');
    	test.done();
    },
    'returns an empty object for non-existing files': function(test) {
    	test.expect(1);
    	var result = this.json.load('tests/config/non-existent.json');
    	test.deepEqual(result, {});
    	test.done();
    },
    'loads the test JSON file': function(test) {
    	test.expect(3);
    	var result = this.json.load('tests/config/test.json');
    	// console.log(result);
    	test.equal(result.matt, 'waz here');
    	test.ok(result.array.length);
    	test.ok(result.objecty['has a property']);
    	test.done();
    },
};