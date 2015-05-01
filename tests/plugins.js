'use strict';

var fs     = require('fs');
var path   = require('path');
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

    setUp : _setUp,

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
            [
                path.join(__dirname, '../plugins/testPlugin.js'),
                path.join(__dirname, '../plugins/testPlugin/index.js'),
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
                path.join('/etc', '/haraka', '/plugins'),
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
                path.join('/etc', '/haraka_plugins'),
                path.join(__dirname, '../plugins')
            ],
            'default + HARAKA_PLUGIN_PATH');
        test.done();
    },
};

