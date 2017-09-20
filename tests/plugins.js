'use strict';

const fs     = require('fs');
const path   = require('path');
const plugin = require('../plugins');

const piName = 'testPlugin';

/*

From: https://github.com/haraka/Haraka/pull/1278#issuecomment-172134064

    * Need to test installed mode + core mode
    * Need to test each variation of loading plugins
        INSTALLED MODE
            * Create tests/installation/ with config/, plugins/, and node_modules
            * Plugin in <install_dir>/plugins/<name>.js
            * Plugin in <install_dir>/plugins/<name>/ with package.json
            * Plugin in <install_dir>/node_modules/<name>/ with package.json
        CORE MODE + INSTALLED MODE
            * Plugin in <core>/plugins/<name>.js
            * Plugin in <core>/plugins/<name>/ with package.json
            * Plugin in <core>/node_modules/<name>/ with package.json
    * Need to test conflict on name in various forms
        * Check plugins/<name>.js loads, not node_modules/<name>/package.json
        * Should be enough of a check(?)
    * Need to test plugin not existing
        * Check <bogus_name_guaranteed_to_not_exist> fails
    * Need to test plugin existing and failing to compile
        * Create bad plugin in tests/installation/plugins/bad_plugin.js
    * Need to test plugin inheritance
        * Base plugin in tests/installation/plugins/base_plugin.js
        * Real plugin in tests/installation/plugins/inherits.js
        * Check base methods work
        * Check plugin.base.base_plugin is set/correct
    * Plugin timeouts (already tested)

*/

exports.plugin = {
    'new Plugin() object': function (test) {
        const pi = new plugin.Plugin(piName);
        test.expect(1);
        test.ok(pi);
        test.done();
    }
};

const toPath = './config/' + piName + '.timeout';

const toVals = [ '0', '3', '60', 'apple'];
const getVal = function () {
    return toVals.shift();
};

exports.get_timeout = {
    setUp : function (done) {
        process.env.WITHOUT_CONFIG_CACHE=true;
        this.to = getVal();
        const self = this;
        fs.writeFile(toPath, this.to, function () {
            self.plugin = new plugin.Plugin(piName);
            done();
        });
    },
    tearDown : function (done) {
        delete process.env.WITHOUT_CONFIG_CACHE;
        fs.unlink(toPath, done);
    },
    '0s' : function (test) {
        test.expect(1);
        test.equal( this.plugin.timeout, this.to );
        test.done();
    },
    '3s' : function (test) {
        test.expect(1);
        test.equal( this.plugin.timeout, this.to );
        test.done();
    },
    '60s' : function (test) {
        test.expect(1);
        test.equal( this.plugin.timeout, this.to );
        test.done();
    },
    '30s default (overrides NaN apple)' : function (test) {
        test.expect(1);
        test.equal( this.plugin.timeout, 30 );
        test.done();
    },
};

exports.plugin_paths = {
    setUp : function (done) {
        delete process.env.HARAKA;
        done();
    },
    tearDown : function (done) {
        delete process.env.HARAKA;
        done();
    },
    'CORE plugin: (tls)' : function (test) {
        const p = new plugin.Plugin('tls');

        test.expect(1);
        test.equal(p.plugin_path, path.resolve(__dirname, '..', 'plugins', 'tls.js'));
        test.done();
    },

    'INSTALLED override: (tls)': function (test) {
        process.env.HARAKA = path.resolve(__dirname, '..', 'tests', 'installation');

        const p = new plugin.Plugin('tls');

        test.expect(1);
        test.equal(p.plugin_path, path.resolve(__dirname, 'installation', 'plugins', 'tls.js'));
        test.done();
    },

    'INSTALLED node_modules package plugin: (test-plugin)': function (test) {
        process.env.HARAKA = path.resolve(__dirname, '..', 'tests', 'installation');

        const p = new plugin.Plugin('test-plugin');

        test.expect(3);
        test.equal(p.plugin_path, path.resolve(__dirname, 'installation', 'node_modules', 'test-plugin', 'package.json'));
        test.ok(p.hasPackageJson);
        try {
            p._compile();
            test.ok(true, "compiles OK");
        }
        catch (e) {
            console.error(e.stack);
            test.ok(false, "compiles OK");
        }
        test.done();
    },

    'CORE package plugin: asn': function (test) {
        const p = new plugin.Plugin('haraka-plugin-asn');

        test.expect(2);
        test.equal(p.plugin_path, path.resolve(__dirname, '..', 'node_modules', 'haraka-plugin-asn', 'package.json'));
        test.ok(p.hasPackageJson);
        test.done();
    },

    'plugins overrides node_modules': function (test) {
        process.env.HARAKA = path.resolve(__dirname, '..', 'tests', 'installation');

        const p = new plugin.Plugin('load_first');

        test.expect(3);
        test.equal(p.plugin_path, path.resolve(__dirname, 'installation', 'plugins', 'load_first.js'));
        try {
            p._compile();
            test.ok(true, "compiles OK");
        }
        catch (e) {
            console.error(e.stack);
            test.ok(false, "compiles OK");
        }
        test.ok(p.loaded_first);
        test.done();
    },

    'INSTALLED plugins folder plugin: (folder_plugin)': function (test) {
        process.env.HARAKA = path.resolve(__dirname, '..', 'tests', 'installation');

        const p = new plugin.Plugin('folder_plugin');

        test.expect(3);
        test.equal(p.plugin_path, path.resolve(__dirname, 'installation', 'plugins', 'folder_plugin', 'package.json'));
        test.ok(p.hasPackageJson);
        try {
            p._compile();
            test.ok(true, "compiles OK");
        }
        catch (e) {
            console.error(e.stack);
            test.ok(false, "compiles OK");
        }
        test.done();
    },

    'Inheritance: (inherits)': function (test) {
        process.env.HARAKA = path.resolve(__dirname, '..', 'tests', 'installation');

        const p = new plugin.Plugin('inherits');

        test.expect(3);
        test.equal(p.plugin_path, path.resolve(__dirname, 'installation', 'plugins', 'inherits.js'));
        try {
            p._compile();
            test.ok(true, "compiles OK");
        }
        catch (e) {
            console.error(e.stack);
            test.ok(false, "compiles OK");
        }
        p.register();
        test.ok(p.base.base_plugin);
        test.done();
    },

};

exports.plugin_config = {
    setUp : function (done) {
        delete process.env.HARAKA;
        done();
    },
    tearDown : function (done) {
        delete process.env.HARAKA;
        done();
    },
    'CORE plugin: (tls)' : function (test) {

        const p = new plugin.Plugin('tls');

        test.expect(2);
        test.equal(p.config.root_path, path.resolve(__dirname, '..', 'config'));
        test.equal(p.config.overrides_path, undefined);
        test.done();
    },

    'INSTALLED override: (tls)': function (test) {
        process.env.HARAKA = path.resolve(__dirname, '..', 'tests', 'installation');

        const p = new plugin.Plugin('tls');

        test.expect(3);
        test.equal(p.config.root_path, path.resolve(__dirname, '..', 'config'));
        test.equal(p.config.overrides_path, path.resolve(__dirname, 'installation', 'config'));
        const tls_ini = p.config.get('tls.ini');
        test.equal(tls_ini.main.ciphers, 'test');
        test.done();
    },

    'INSTALLED node_modules package plugin: (test-plugin)': function (test) {
        process.env.HARAKA = path.resolve(__dirname, '..', 'tests', 'installation');

        const p = new plugin.Plugin('test-plugin');

        test.expect(2);
        test.equal(p.config.root_path, path.resolve(__dirname, 'installation', 'node_modules', 'test-plugin', 'config'));
        test.equal(p.config.overrides_path, path.resolve(__dirname, 'installation', 'config'));
        test.done();
    },
}

