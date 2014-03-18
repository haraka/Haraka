var stub             = require('./fixtures/stub'),
    Plugin           = require('./fixtures/stub_plugin'),
    configfile   = require('../configfile'),
    config       = require('../config');

var cb = function () { return false; };
var opts = { booleans: ['arg1'] };

exports.arrange_args = {
    // config.get('name');
    'name' : function (test) {
        test.expect(1);
        test.deepEqual(config.arrange_args(['test.ini']), ['test.ini', 'ini', undefined, undefined]);
        test.done();
    },
    // config.get('name', type);
    'name, type' : function (test) {
        test.expect(1);
        test.deepEqual(config.arrange_args(['test.ini','ini']), ['test.ini', 'ini', undefined, undefined]);
        test.done();
    },
    // config.get('name', cb);
    'name, callback' : function (test) {
        test.expect(1);
        test.deepEqual(config.arrange_args(['test.ini',cb]), ['test.ini', 'ini', cb, undefined]);
        test.done();
    },
    // config.get('name', cb, options);
    'name, callback, options' : function (test) {
        test.expect(1);
        test.deepEqual(config.arrange_args(['test.ini',cb,opts]), ['test.ini', 'ini', cb, opts]);
        test.done();
    },
    // config.get('name', options);
    'name, options' : function (test) {
        test.expect(1);
        test.deepEqual(config.arrange_args(['test.ini',opts]), ['test.ini', 'ini', undefined, opts]);
        test.done();
    },
    // config.get('name', type, cb);
    'name, type, callback' : function (test) {
        test.expect(1);
        test.deepEqual(config.arrange_args(['test.ini','ini',cb]), ['test.ini', 'ini', cb, undefined]);
        test.done();
    },
    // config.get('name', type, options);
    'name, type, options' : function (test) {
        test.expect(1);
        test.deepEqual(config.arrange_args(['test.ini','ini',opts]), ['test.ini', 'ini', undefined, opts]);
        test.done();
    },
    // config.get('name', type, cb, options);
    'name, type, callback, options' : function (test) {
        test.expect(1);
        test.deepEqual(config.arrange_args(['test.ini','ini',cb, opts]), ['test.ini', 'ini', cb, opts]);
        test.done();
    },
    // config.get('name', list, cb, options);
    'name, list type, callback, options' : function (test) {
        test.expect(1);
        test.deepEqual(config.arrange_args(['test.ini','list',cb, opts]), ['test.ini', 'list', cb, opts]);
        test.done();
    },
    // config.get('name', binary, cb, options);
    'name, binary type, callback, options' : function (test) {
        test.expect(1);
        test.deepEqual(config.arrange_args(['test.ini','binary',cb, opts]), ['test.ini', 'binary', cb, opts]);
        test.done();
    },
    // config.get('name', type, cb, options);
    'name, value type, callback, options' : function (test) {
        test.expect(1);
        test.deepEqual(config.arrange_args(['test.ini','value',cb, opts]), ['test.ini', 'value', cb, opts]);
        test.done();
    },
    // config.get('name', type, cb, options);
    'name, json type, callback, options' : function (test) {
        test.expect(1);
        test.deepEqual(config.arrange_args(['test.ini','json',cb, opts]), ['test.ini', 'json', cb, opts]);
        test.done();
    },
    // config.get('name', type, cb, options);
    'name, data type, callback, options' : function (test) {
        test.expect(1);
        test.deepEqual(config.arrange_args(['test.ini','data',cb, opts]), ['test.ini', 'data', cb, opts]);
        test.done();
    },
};

var res = { "main": {} };
var res2 = { "main": { "reject": true } };
var testopts = { booleans: ['main.bool_true','main.bool_false'] };
var testini1 = { main: { bool_true: 'true', bool_false: 'false', str_true: 'true', str_false: 'false' } };
var testini2 = { main: { bool_true: true, bool_false: false, str_true: 'true', str_false: 'false' } };

function _test_get(test, name, type, callback, options, expected) {
    test.expect(1);
    test.deepEqual(config.get(name,type,callback,options), expected);
    test.done();
}

exports.get = {
    // config.get('name');
    'name, bare' : function (test) {
        _test_get(test, 'test', null, null, null, null);
    },
    // config.get('name.ini');
    'name.ini' : function (test) {
        _test_get(test, 'test.ini', null, null, null, res);
    },
    'test.ini, no opts' : function (test) {
        _test_get(test, '../tests/test.ini', null, null, null, testini1);
    },
    // CACHE BUG
    /*
    'test.ini, opts' : function (test) {
        _test_get(test, '../tests/test.ini', null, null, testopts, testini2);
    },
    */
};

exports.load_ini_config = {
    'non-exist.ini empty' : function (test) {
        test.expect(1);
        test.deepEqual(
                configfile.load_ini_config('non-exist.ini'),
                { main: { } }
                );
        test.done();
    },
    'non-exist.ini boolean' : function (test) {
        test.expect(1);
        test.deepEqual(
                configfile.load_ini_config('non-exist.ini', { booleans: ['reject']}),
                { main: { reject: undefined } }
                );
        test.done();
    },
    'test.ini, no opts' : function (test) {
        test.expect(4);
        var r = configfile.load_ini_config('tests/test.ini');
        test.strictEqual(r.main.bool_true, 'true');
        test.strictEqual(r.main.bool_false, 'false');
        test.strictEqual(r.main.str_true, 'true');
        test.strictEqual(r.main.str_false, 'false');
        test.done();
    },
    'test.ini, opts' : function (test) {
        test.expect(4);
        var r = configfile.load_ini_config('tests/test.ini', testopts);
        test.strictEqual(r.main.bool_true, true);
        test.strictEqual(r.main.bool_false, false);
        test.strictEqual(r.main.str_true, 'true');
        test.strictEqual(r.main.str_false, 'false');
        test.done();
    },
};
