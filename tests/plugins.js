'use strict';

var path = require('path');
var plugin = require('../plugins');


exports.plugin = {
    'new Plugin() object': function (test) {
        var pi = new plugin.Plugin('testPlugin');
        test.expect(1);
        test.ok(pi);
        test.done();
    }
};

exports.get_plugin_paths = {

    setUp : function (done) {
        this.plugin = new plugin.Plugin('testPlugin');
        done();
    },
    './path' : function (test) {
        
        ['HARAKA', 'HARAKA_PLUGIN_PATH'].forEach(function (env) {
            delete process.env[env];
        });

        test.expect(2);
        test.deepEqual(
            this.plugin._get_plugin_paths(),
            [ path.join(__dirname, '../plugins') ],
            'default ./path'
        );
        test.deepEqual(
            this.plugin.full_paths,
            [ path.join(__dirname, '../plugins/testPlugin.js') ],
            'full_paths');
        test.done();
    },

    'HARAKA' : function (test) {
        
        ['HARAKA_PLUGIN_PATH'].forEach(function (env) {
            delete process.env[env];
        });
        process.env.HARAKA = '/etc/haraka';
        
        test.expect(1);
        test.deepEqual(
            this.plugin._get_plugin_paths(),
            [
                '/etc/haraka/plugins',
                path.join(__dirname, '../plugins')
            ],
            'default ./path'
        );
        test.done();
    },

    'HARAKA_PLUGIN_PATH' : function (test) {

        ['HARAKA'].forEach(function (env) {
            delete process.env[env];
        });
        process.env.HARAKA_PLUGIN_PATH = '/etc/haraka_plugins';

        test.expect(1);        
        test.deepEqual(
            this.plugin._get_plugin_paths(),
            [
                '/etc/haraka_plugins',
                path.join(__dirname, '../plugins')
            ],
            'default + HARAKA_PLUGIN_PATH');
        test.done();
    },
};

