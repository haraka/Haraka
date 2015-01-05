'use strict';

var _set_up = function (done) {
    this.yaml = require('../../cfreader/yaml');
    done();
};

exports.load = {
    setUp : _set_up,
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
    'throws when file is non-existent': function(test) {
        test.expect(2);
        try {
            this.yaml.load('tests/config/non-existent.haml');
        }
        catch (e) {
            test.equal(e.code, 'ENOENT');
            test.ok(/no such file or dir/.test(e.message));
        }
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
