'use strict';

var _set_up = function (done) {
    this.yaml = require('../../cfreader/yaml');
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
        test.ok(this.yaml);
        test.done();
    },
    'has a load function': function(test) {
    	test.expect(1);
    	test.ok(typeof this.yaml.load === 'function');
    	test.done();
    },
    'returns an empty object for non-existing files': function(test) {
    	test.expect(1);
    	var result = this.yaml.load('tests/config/non-existent.yaml');
    	test.deepEqual(result, {});
    	test.done();
    },
    'loads the test yaml file': function(test) {
    	test.expect(4);
    	var result = this.yaml.load('tests/config/test.yaml');
    	// console.log(result);
        test.strictEqual(result.main.bool_true, true);
    	test.equal(result.matt, 'waz here');
    	test.ok(result.array.length);
    	test.ok(result.objecty['has a property']);
    	test.done();
    },
};