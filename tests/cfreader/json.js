'use strict';

var _set_up = function (done) {
    this.json = require('../../cfreader/json');
    done();
};

exports.load = {
    setUp : _set_up,
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
    'throws when file is non-existent': function(test) {
        test.expect(2);
        try {
            this.json.load('tests/config/non-existent.json');
        }
        catch (e) {
            test.equal(e.code, 'ENOENT');
            test.ok(/no such file or dir/.test(e.message));
        }
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
