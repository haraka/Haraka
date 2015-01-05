'use strict';

var regex = require('../../configfile').regex;

var _set_up = function (done) {
    this.ini = require('../../cfreader/ini');
    this.opts = { booleans: ['main.bool_true','main.bool_false'] };
    done();
};

exports.load = {
    setUp: _set_up,
    'module is required' : function (test) {
        test.expect(1);
        test.ok(this.ini);
        test.done();
    },
    'has a load function': function(test) {
        test.expect(1);
        test.ok(typeof this.ini.load === 'function');
        test.done();
    },
    'loads the test ini file': function(test) {
        test.expect(1);
        var result = this.ini.load('tests/config/test.ini',  {}, regex);
        // console.log(result);
        test.deepEqual(result.main,
                { bool_true: 'true', bool_false: 'false',
                    str_true: 'true', str_false: 'false'
                }
                );
        test.done();
    },
    'test.ini, no opts' : function (test) {
        test.expect(4);
        var r = this.ini.load('tests/config/test.ini', {}, regex);
        test.strictEqual(r.main.bool_true, 'true');
        test.strictEqual(r.main.bool_false, 'false');
        test.strictEqual(r.main.str_true, 'true');
        test.strictEqual(r.main.str_false, 'false');
        test.done();
    },
    'test.ini, opts' : function (test) {
        test.expect(4);
        var r = this.ini.load('tests/config/test.ini', this.opts, regex).main;
        test.strictEqual(r.bool_true, true);
        test.strictEqual(r.bool_false, false);
        test.strictEqual(r.str_true, 'true');
        test.strictEqual(r.str_false, 'false');
        test.done();
    },
    'test.ini, sect1, opts' : function (test) {
        test.expect(4);
        var r = this.ini.load('tests/config/test.ini', {
            booleans: ['sect1.bool_true','sect1.bool_false']
        }, regex);
        test.strictEqual(r.sect1.bool_true, true);
        test.strictEqual(r.sect1.bool_false, false);
        test.strictEqual(r.sect1.str_true, 'true');
        test.strictEqual(r.sect1.str_false, 'false');
        test.done();
    },
    'test.ini, sect1, opts, w/defaults' : function (test) {
        test.expect(6);
        var r = this.ini.load('tests/config/test.ini', {
            booleans: ['+sect1.bool_true','-sect1.bool_false', 
            '+sect1.bool_true_default', 'sect1.-bool_false_default']
        }, regex);
        test.strictEqual(r.sect1.bool_true, true);
        test.strictEqual(r.sect1.bool_false, false);
        test.strictEqual(r.sect1.str_true, 'true');
        test.strictEqual(r.sect1.str_false, 'false');
        test.strictEqual(r.sect1.bool_true_default, true);
        test.strictEqual(r.sect1.bool_false_default, false);
        test.done();
    },
};

exports.empty = {
    setUp: _set_up,
    'non-exist.ini is template' : function (test) {
        test.expect(1);
        test.deepEqual(this.ini.empty(), { main: { } } );
        test.done();
    },
    'non-exist.ini boolean' : function (test) {
        test.expect(1);
        test.deepEqual(
                this.ini.empty({ booleans: ['reject']}),
                { main: { reject: false } }
                );
        test.done();
    },
    'non-exist.ini boolean true default' : function (test) {
        test.expect(3);
        test.deepEqual(
                this.ini.empty({ booleans: ['+reject']}),
                { main: { reject: true } }
                );
        test.deepEqual(
                this.ini.empty({ booleans: ['+main.reject']}),
                { main: { reject: true } }
                );
        test.deepEqual(
                this.ini.empty({ booleans: ['main.+reject']}),
                { main: { reject: true } }
                );
        test.done();
    },
    'non-exist.ini boolean false default' : function (test) {
        test.expect(3);
        test.deepEqual(
                this.ini.empty({ booleans: ['-reject']}),
                { main: { reject: false } }
                );
        test.deepEqual(
                this.ini.empty({ booleans: ['-main.reject']}),
                { main: { reject: false } }
                );
        test.deepEqual(
                this.ini.empty({ booleans: ['main.-reject']}),
                { main: { reject: false } }
                );
        test.done();
    },
    'non-exist.ini boolean false default, section' : function (test) {
        test.expect(2);
        test.deepEqual(
                this.ini.empty({ booleans: ['-reject.boolf']}),
                { main: { }, reject: {boolf: false} }
                );
        test.deepEqual(
                this.ini.empty({ booleans: ['+reject.boolt']}),
                { main: { }, reject: {boolt: true} }
                );
        test.done();
    },
};
