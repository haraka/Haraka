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
        _test_get(test, '../tests/test.ini', null, null, null, {
            main: { bool_true: 'true', bool_false: 'false', str_true: 'true', str_false: 'false' },
            sect1: { bool_true: 'true', bool_false: 'false', str_true: 'true', str_false: 'false' },
            whitespace: { str_no_trail: 'true', str_trail: 'true' }
        });
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
                { main: { reject: false } }
                );
        test.done();
    },
    'non-exist.ini boolean true default' : function (test) {
        test.expect(3);
        test.deepEqual(
                configfile.load_ini_config('non-exist.ini', { booleans: ['+reject']}),
                { main: { reject: true } }
                );
        test.deepEqual(
                configfile.load_ini_config('non-exist.ini', { booleans: ['+main.reject']}),
                { main: { reject: true } }
                );
        test.deepEqual(
                configfile.load_ini_config('non-exist.ini', { booleans: ['main.+reject']}),
                { main: { reject: true } }
                );
        test.done();
    },
    'non-exist.ini boolean false default' : function (test) {
        test.expect(3);
        test.deepEqual(
                configfile.load_ini_config('non-exist.ini', { booleans: ['-reject']}),
                { main: { reject: false } }
                );
        test.deepEqual(
                configfile.load_ini_config('non-exist.ini', { booleans: ['-main.reject']}),
                { main: { reject: false } }
                );
        test.deepEqual(
                configfile.load_ini_config('non-exist.ini', { booleans: ['main.-reject']}),
                { main: { reject: false } }
                );
        test.done();
    },
    'non-exist.ini boolean false default, section' : function (test) {
        test.expect(2);
        test.deepEqual(
                configfile.load_ini_config('non-exist.ini', { booleans: ['-reject.boolf']}),
                { main: { }, reject: {boolf: false} }
                );
        test.deepEqual(
                configfile.load_ini_config('non-exist.ini', { booleans: ['+reject.boolt']}),
                { main: { }, reject: {boolt: true} }
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
    'test.ini, sect1, opts' : function (test) {
        test.expect(4);
        var r = configfile.load_ini_config('tests/test.ini', {
            booleans: ['sect1.bool_true','sect1.bool_false']
        });
        test.strictEqual(r.sect1.bool_true, true);
        test.strictEqual(r.sect1.bool_false, false);
        test.strictEqual(r.sect1.str_true, 'true');
        test.strictEqual(r.sect1.str_false, 'false');
        test.done();
    },
    'test.ini, sect1, opts, w/defaults' : function (test) {
        test.expect(6);
        var r = configfile.load_ini_config('tests/test.ini', {
            booleans: ['+sect1.bool_true','-sect1.bool_false', 
                       '+sect1.bool_true_default', 'sect1.-bool_false_default']
        });
        test.strictEqual(r.sect1.bool_true, true);
        test.strictEqual(r.sect1.bool_false, false);
        test.strictEqual(r.sect1.str_true, 'true');
        test.strictEqual(r.sect1.str_false, 'false');
        test.strictEqual(r.sect1.bool_true_default, true);
        test.strictEqual(r.sect1.bool_false_default, false);
        test.done();
    },
};
