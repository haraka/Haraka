'use strict';

var fs     = require('fs');
var path   = require('path');
var logger = require('../logger');
var plugin = require('../plugins');

var piName = 'testPlugin';

var _setUp = function (done) {
    this.plugin = new plugin.Plugin(piName);
    done();
};

exports.plugin = {
    'new Plugin() object': function (test) {
        var pi = new plugin.Plugin(piName);
        test.expect(1);
        test.ok(pi);
        test.done();
    }
};

var toPath = './config/' + piName + '.timeout';

var toVals = [ '0', '3', '60', 'apple'];
var getVal = function () {
    return toVals.shift();
};

exports.get_timeout = {
    setUp : function (done) {
        process.env.WITHOUT_CONFIG_CACHE=true;
        this.to = getVal();
        fs.writeFile(toPath, this.to, done);
    },
    tearDown : function (done) {
        fs.unlink(toPath, done);
    },
    '0s' : function (test) {
        var pi = new plugin.Plugin(piName);
        test.expect(1);
        test.equal( pi.timeout, this.to );
        test.done();
    },
    '3s' : function (test) {
        var pi = new plugin.Plugin(piName);
        test.expect(1);
        test.equal( pi.timeout, this.to );
        test.done();
    },
    '60s' : function (test) {
        var pi = new plugin.Plugin(piName);
        test.expect(1);
        test.equal( pi.timeout, this.to );
        test.done();
    },
    '30s default' : function (test) {
        var pi = new plugin.Plugin(piName);
        test.expect(1);
        test.equal( pi.timeout, 30 );
        test.done();
    },
};

exports.get_plugin_paths = {

    /* jshint maxlen: 90 */
    setUp : _setUp,

    './path' : function (test) {

        ['HARAKA', 'HARAKA_PLUGIN_PATH'].forEach(function (env) {
            delete process.env[env];
        });

        test.expect(2);
        test.deepEqual(
            this.plugin._get_plugin_paths(),
            [
                path.join(__dirname, '../plugins'),
                path.join(__dirname, '../node_modules'),
            ],
            'default ./path'
        );
        test.deepEqual(
            this.plugin.full_paths,
            [
                path.join(__dirname, '../plugins', 'testPlugin','package.json'),
                path.join(__dirname, '../plugins', 'testPlugin.js'),
                path.join(__dirname, '../plugins', 'testPlugin','index.js'),
                path.join(__dirname, '../node_modules', 'testPlugin','package.json'),
                path.join(__dirname, '../node_modules', 'testPlugin.js'),
                path.join(__dirname, '../node_modules', 'testPlugin','index.js'),
            ],
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
                path.join('/etc', 'haraka', 'plugins'),
                path.join('/etc', 'haraka', 'node_modules'),
                path.join(__dirname, '..', 'plugins'),
                path.join(__dirname, '..', 'node_modules'),
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
                path.join('/etc', '/haraka_plugins'),
                path.join(__dirname, '../plugins'),
                path.join(__dirname, '../node_modules'),
            ],
            'default + HARAKA_PLUGIN_PATH');
        test.done();
    },

    'all of the above' : function (test) {

        process.env.HARAKA = '/etc/haraka';
        process.env.HARAKA_PLUGIN_PATH = '/etc/haraka_plugins';

        test.expect(1);
        test.deepEqual(
            this.plugin._get_plugin_paths(),
            [
                path.join(process.env.HARAKA_PLUGIN_PATH),
                path.join(process.env.HARAKA + '/plugins'),
                path.join(process.env.HARAKA + '/node_modules'),
                path.join(__dirname, '../plugins'),
                path.join(__dirname, '../node_modules'),
            ],
            'all paths are ordered correctly'
        );
        test.done();
    },
};

exports.load_plugins = {

    setUp: function (done) {
        process.env.HARAKA = __dirname;

        this.orig_make_custom_require = plugin._make_custom_require;
        plugin._make_custom_require = function (filePath, hasPackageJson) {
            return function (module) {
                return require(path.join(__dirname, 'node_modules', module));
            };
        };

        this.plugin = plugin.load_plugin('test-plugin');
        done();
    },

    tearDown: function (done) {
        plugin._make_custom_require = this.orig_make_custom_require;
        done();
    },

    'load from install directory node_modules': function (test) {
        test.expect(1);
        test.ok(this.plugin.hasOwnProperty('hook_init_master'));
        test.done();
    },

};
