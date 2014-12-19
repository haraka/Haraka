'use strict';

var _set_up = function (done) {
    this.cfreader = require('../configfile');
    done();
};

exports.get_filetype_reader  = {
    setUp: _set_up,
    'binary': function (test) {
        test.expect(2);
        var reader = this.cfreader.get_filetype_reader('binary');
        test.equal(typeof reader.load, 'function');
        test.equal(typeof reader.empty, 'function');
        test.done();
    },
    'flat': function (test) {
        test.expect(2);
        var reader = this.cfreader.get_filetype_reader('flat');
        test.equal(typeof reader.load, 'function');
        test.equal(typeof reader.empty, 'function');
        test.done();
    },
    'json': function (test) {
        test.expect(2);
        var reader = this.cfreader.get_filetype_reader('json');
        test.equal(typeof reader.load, 'function');
        test.equal(typeof reader.empty, 'function');
        test.done();
    },
    'ini': function (test) {
        test.expect(2);
        var reader = this.cfreader.get_filetype_reader('ini');
        test.equal(typeof reader.load, 'function');
        test.equal(typeof reader.empty, 'function');
        test.done();
    },
    'yaml': function (test) {
        test.expect(2);
        var reader = this.cfreader.get_filetype_reader('yaml');
        test.equal(typeof reader.load, 'function');
        test.equal(typeof reader.empty, 'function');
        test.done();
    },
    'value': function (test) {
        test.expect(2);
        var reader = this.cfreader.get_filetype_reader('value');
        test.equal(typeof reader.load, 'function');
        test.equal(typeof reader.empty, 'function');
        test.done();
    },
    'list': function (test) {
        test.expect(2);
        var reader = this.cfreader.get_filetype_reader('list');
        test.equal(typeof reader.load, 'function');
        test.equal(typeof reader.empty, 'function');
        test.done();
    },
};

exports.non_existing = {
    setUp: _set_up,

    'empty object for JSON files': function(test) {
        test.expect(1);
        var result = this.cfreader.load_config(
                'tests/config/non-existent.json',
                'json'
                );
        test.deepEqual(result, {});
        test.done();
    },
    'empty object for YAML files': function(test) {
        test.expect(1);
        var result = this.cfreader.load_config(
                'tests/config/non-existent.yaml',
                'yaml'
                );
        test.deepEqual(result, {});
        test.done();
    },
    'null for binary file': function(test) {
        test.expect(1);
        var result = this.cfreader.load_config(
                'tests/config/non-existent.bin',
                'binary'
                );
        test.equal(result, null);
        test.done();
    },
    'empty string for flat file': function(test) {
        test.expect(1);
        var result = this.cfreader.load_config(
                'tests/config/non-existent.flat',
                'flat'
                );
        test.deepEqual(result, null);
        test.done();
    },
    'empty string for value file': function(test) {
        test.expect(1);
        var result = this.cfreader.load_config(
                'tests/config/non-existent.value',
                'value'
                );
        test.deepEqual(result, null);
        test.done();
    },
    'empty array for list file': function(test) {
        test.expect(1);
        var result = this.cfreader.load_config(
            'tests/config/non-existent.list',
            'list'
            );
        test.deepEqual(result, []);
        test.done();
    },
    'template ini for INI file': function(test) {
        test.expect(1);
        var result = this.cfreader.load_config(
                'tests/config/non-existent.ini',
                'ini'
                );
        test.deepEqual(result, { main: {} });
        test.done();
    },
};
