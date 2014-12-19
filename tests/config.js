'use strict';

var stub      = require('./fixtures/stub');
var Plugin    = require('./fixtures/stub_plugin');
var config    = require('../config');

var cb = function () { return false; };
var opts = { booleans: ['arg1'] };

exports.arrange_args = {
    // config.get('name');
    'name' : function (test) {
        test.expect(1);
        test.deepEqual(
            config.arrange_args(['test.ini']),
            ['test.ini', 'ini', undefined, undefined]);
        test.done();
    },
    // config.get('name', type);
    'name, type' : function (test) {
        test.expect(1);
        test.deepEqual(
            config.arrange_args(['test.ini','ini']),
            ['test.ini', 'ini', undefined, undefined]);
        test.done();
    },
    // config.get('name', cb);
    'name, callback' : function (test) {
        test.expect(1);
        test.deepEqual(
            config.arrange_args(['test.ini',cb]),
            ['test.ini', 'ini', cb, undefined]);
        test.done();
    },
    // config.get('name', cb, options);
    'name, callback, options' : function (test) {
        test.expect(1);
        test.deepEqual(
            config.arrange_args(['test.ini',cb,opts]),
            ['test.ini', 'ini', cb, opts]);
        test.done();
    },
    // config.get('name', options);
    'name, options' : function (test) {
        test.expect(1);
        test.deepEqual(
            config.arrange_args(['test.ini',opts]),
            ['test.ini', 'ini', undefined, opts]);
        test.done();
    },
    // config.get('name', type, cb);
    'name, type, callback' : function (test) {
        test.expect(1);
        test.deepEqual(
            config.arrange_args(['test.ini','ini',cb]),
            ['test.ini', 'ini', cb, undefined]);
        test.done();
    },
    // config.get('name', type, options);
    'name, type, options' : function (test) {
        test.expect(1);
        test.deepEqual(
            config.arrange_args(['test.ini','ini',opts]),
            ['test.ini', 'ini', undefined, opts]);
        test.done();
    },
    // config.get('name', type, cb, options);
    'name, type, callback, options' : function (test) {
        test.expect(1);
        test.deepEqual(
            config.arrange_args(['test.ini','ini',cb, opts]),
            ['test.ini', 'ini', cb, opts]);
        test.done();
    },
    // config.get('name', list, cb, options);
    'name, list type, callback, options' : function (test) {
        test.expect(1);
        test.deepEqual(
            config.arrange_args(['test.ini','list',cb, opts]),
            ['test.ini', 'list', cb, opts]);
        test.done();
    },
    // config.get('name', binary, cb, options);
    'name, binary type, callback, options' : function (test) {
        test.expect(1);
        test.deepEqual(
            config.arrange_args(['test.ini','binary',cb, opts]),
            ['test.ini', 'binary', cb, opts]);
        test.done();
    },
    // config.get('name', type, cb, options);
    'name, value type, callback, options' : function (test) {
        test.expect(1);
        test.deepEqual(
            config.arrange_args(['test.ini','value',cb, opts]),
            ['test.ini', 'value', cb, opts]);
        test.done();
    },
    // config.get('name', type, cb, options);
    'name, json type, callback, options' : function (test) {
        test.expect(1);
        test.deepEqual(
            config.arrange_args(['test.ini','json',cb, opts]),
            ['test.ini', 'json', cb, opts]);
        test.done();
    },
    // config.get('name', type, cb, options);
    'name, data type, callback, options' : function (test) {
        test.expect(1);
        test.deepEqual(
            config.arrange_args(['test.ini','data',cb, opts]),
            ['test.ini', 'data', cb, opts]);
        test.done();
    },
};

var jsonRes = {
    matt: 'waz here', 
    array: [ 'has an element' ],
    objecty: { 'has a property': 'with a value' }
};

var yamlRes = {
    main: {
        bool_true: true,
        bool_false: false,
        str_true: true,
        str_false: false
    },
    sect1: {
        bool_true: true,
        bool_false: false,
        str_true: true,
        str_false: false
    },
    whitespace: {
        str_no_trail: true,
        str_trail: true
    },
    matt: 'waz here',
    array: ['has an element'],
    objecty: {
        'has a property': 'with a value'
    }
};

function _test_get(test, name, type, callback, options, expected) {
    test.expect(1);
    test.deepEqual(config.get(name,type,callback,options), expected);
    test.done();
}

exports.get = {
    // config.get('name');
    'name=test (non-existing)' : function (test) {
        _test_get(test, 'test', null, null, null, null);
    },

    // config.get('name.ini');
    'name.ini' : function (test) {
        _test_get(test, 'test.ini', null, null, null, { "main": {} });
    },
    'test.ini, no opts' : function (test) {
        _test_get(test, '../tests/config/test.ini', null, null, null, {
            main: { bool_true: 'true', bool_false: 'false', str_true: 'true', str_false: 'false' },
            sect1: { bool_true: 'true', bool_false: 'false', str_true: 'true', str_false: 'false' },
            whitespace: { str_no_trail: 'true', str_trail: 'true' }
        });
    },

    // config.get('test.txt');
    'test.txt' : function (test) {
        _test_get(test, 'test.txt', null, null, null, null);
    },

    // config.get('test.flat');
    'test.flat, type=' : function (test) {
        _test_get(test, '../tests/config/test.flat', null, null, null, 'line1');
    },

    // NOTE: the test.flat file had to be duplicated for these tests, to avoid
    // the config cache from returning invalid results.

    // config.get('test.flat', 'value');
    'test.flat, type=value' : function (test) {
        _test_get(test, '../tests/config/test.value', 'value', null, null, 'line1');
    },
    // config.get('test.flat', 'list');
    'test.flat, type=list' : function (test) {
        _test_get(test, '../tests/config/test.list', 'list', null, null,
            ['line1', 'line2','line3', 'line5'] );
    },
    // config.get('test.flat', 'data');
    'test.flat, type=data' : function (test) {
        _test_get(test, '../tests/config/test.data', 'data', null, null,
            ['line1', 'line2','line3', '', 'line5'] );
    },

    // config.get('test.json');
    'test.json, type=' : function (test) {
        _test_get(test, '../tests/config/test.json', null, null, null, jsonRes);
    },
    // config.get('test.json', 'json');
    'test.json, type=json' : function (test) {
        _test_get(test, '../tests/config/test.json', 'json', null, null, jsonRes);
    },

    // config.get('test.yaml');
    'test.yaml, type=' : function (test) {
        _test_get(test, '../tests/config/test.yaml', null, null, null, yamlRes);
    },
    // config.get('test.yaml', 'yaml');
    'test.yaml, type=yaml' : function (test) {
        _test_get(test, '../tests/config/test.yaml', 'yaml', null, null, yamlRes);
    },
    // config.get('missing.json');
    'missing.yaml, asked for json' : function (test) {
        _test_get(test, '../tests/config/missing.json', 'json', null, null, {"matt": "waz here"});
    },

    // config.get('test.bin', 'binary');
    'test.bin, type=binary' : function (test) {
        test.expect(2);
        var res = config.get('../tests/config/test.binary', 'binary');
        test.equal(res.length, 120);
        test.ok(Buffer.isBuffer(res));
        test.done();
    },
};
