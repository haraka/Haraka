'use strict';

var regex = require('../../configfile').regex;

var _set_up = function (done) {
    this.flat = require('../../cfreader/flat');
    done();
};

exports.load = {
    setUp: _set_up,
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
    'throws when file is non-existent': function(test) {
        test.expect(2);
        try {
            this.flat.load('tests/config/non-existent.flat');
        }
        catch (e) {
            test.equal(e.code, 'ENOENT');
            test.ok(/no such file or dir/.test(e.message));
        }
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
