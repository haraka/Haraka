'use strict';

var _set_up = function (done) {
    this.cfreader = require('../configfile');
    this.opts = { booleans: ['main.bool_true','main.bool_false'] };
    done();
};

exports.load_ini_config = {
    setUp: _set_up,
    'non-exist.ini empty' : function (test) {
        test.expect(1);
        test.deepEqual(
                this.cfreader.load_ini_config('non-exist.ini'),
                { main: { } }
                );
        test.done();
    },
    'non-exist.ini boolean' : function (test) {
        test.expect(1);
        test.deepEqual(
                this.cfreader.load_ini_config('non-exist.ini',
                    { booleans: ['reject']}),
                { main: { reject: false } }
                );
        test.done();
    },
    'non-exist.ini boolean true default' : function (test) {
        test.expect(3);
        test.deepEqual(
                this.cfreader.load_ini_config('non-exist.ini',
                    { booleans: ['+reject']}),
                { main: { reject: true } }
                );
        test.deepEqual(
                this.cfreader.load_ini_config('non-exist.ini',
                    { booleans: ['+main.reject']}),
                { main: { reject: true } }
                );
        test.deepEqual(
                this.cfreader.load_ini_config('non-exist.ini',
                    { booleans: ['main.+reject']}),
                { main: { reject: true } }
                );
        test.done();
    },
    'non-exist.ini boolean false default' : function (test) {
        test.expect(3);
        test.deepEqual(
                this.cfreader.load_ini_config('non-exist.ini',
                    { booleans: ['-reject']}),
                { main: { reject: false } }
                );
        test.deepEqual(
                this.cfreader.load_ini_config('non-exist.ini',
                    { booleans: ['-main.reject']}),
                { main: { reject: false } }
                );
        test.deepEqual(
                this.cfreader.load_ini_config('non-exist.ini',
                    { booleans: ['main.-reject']}),
                { main: { reject: false } }
                );
        test.done();
    },
    'non-exist.ini boolean false default, section' : function (test) {
        test.expect(2);
        test.deepEqual(
                this.cfreader.load_ini_config('non-exist.ini',
                    { booleans: ['-reject.boolf']}),
                { main: { }, reject: {boolf: false} }
                );
        test.deepEqual(
                this.cfreader.load_ini_config('non-exist.ini',
                    { booleans: ['+reject.boolt']}),
                { main: { }, reject: {boolt: true} }
                );
        test.done();
    },
    'test.ini, no opts' : function (test) {
        test.expect(4);
        var r = this.cfreader.load_ini_config('tests/config/test.ini');
        test.strictEqual(r.main.bool_true, 'true');
        test.strictEqual(r.main.bool_false, 'false');
        test.strictEqual(r.main.str_true, 'true');
        test.strictEqual(r.main.str_false, 'false');
        test.done();
    },
    'test.ini, opts' : function (test) {
        test.expect(4);
        var r = this.cfreader.load_ini_config('tests/config/test.ini', this.opts);
        test.strictEqual(r.main.bool_true, true);
        test.strictEqual(r.main.bool_false, false);
        test.strictEqual(r.main.str_true, 'true');
        test.strictEqual(r.main.str_false, 'false');
        test.done();
    },
    'test.ini, sect1, opts' : function (test) {
        test.expect(4);
        var r = this.cfreader.load_ini_config('tests/config/test.ini', {
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
        var r = this.cfreader.load_ini_config('tests/config/test.ini', {
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
    'test.ini, funnychars, /' : function (test) {
        test.expect(1);
        var r = this.cfreader.load_ini_config('tests/config/test.ini');
        test.strictEqual(r.funnychars['results.auth/auth_base.fail'], 'fun');
        test.done();
    },
    'test.ini, funnychars, _' : function (test) {
        test.expect(1);
        var r = this.cfreader.load_ini_config('tests/config/test.ini');
        test.strictEqual(r.funnychars['results.auth/auth_base.fail'], 'fun');
        test.done();
    },
    'test.ini, ipv6 addr, :' : function (test) {
        test.expect(1);
        var r = this.cfreader.load_ini_config('tests/config/test.ini');
        test.ok( '2605:ae00:329::2' in r.has_ipv6 );
        test.done();
    },
    'test.ini, empty value' : function (test) {
        test.expect(1);
        var r = this.cfreader.load_ini_config('tests/config/test.ini');
        test.deepEqual({ first: undefined, second: undefined}, r.empty_values);
        test.done();
    },
    'test.ini, array' : function(test){
        test.expect(2);
        var r = this.cfreader.load_ini_config('tests/config/test.ini');
        test.deepEqual(['first_host', 'second_host', 'third_host'], r.array_test.hostlist);
        test.deepEqual([123, 456, 789], r.array_test.intlist);
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
    'null for flat file': function(test) {
        test.expect(1);
        var result = this.cfreader.load_config(
                'tests/config/non-existent.flat',
                'flat'
                );
        test.deepEqual(result, null);
        test.done();
    },
    'null for value file': function(test) {
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

exports.get_cache_key = {
    setUp: _set_up,
    'no options is the name': function (test) {
        test.expect(1);
        test.equal(this.cfreader.get_cache_key('test'),
            'test');
        test.done();
    },
    'one option is name + serialized opts': function (test) {
        test.expect(1);
        test.equal(this.cfreader.get_cache_key('test', {foo: 'bar'}),
            'test{"foo":"bar"}');
        test.done();
    },
    'two options are returned predictably': function (test) {
        test.expect(1);
        test.equal(
            this.cfreader.get_cache_key('test', {opt1: 'foo', opt2: 'bar'}),
            'test{"opt1":"foo","opt2":"bar"}');
        test.done();
    }
};
