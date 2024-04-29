'use strict';

process.env.WITHOUT_CONFIG_CACHE=true;

const assert = require('node:assert')
const fs     = require('node:fs');
const path   = require('node:path');

const plugin = require('../plugins');

const piName = 'testPlugin';

/*

From: https://github.com/haraka/Haraka/pull/1278#issuecomment-172134064

    * Need to test installed mode + core mode
    * Need to test each variation of loading plugins
        INSTALLED MODE
            * Create test/installation/ with config/, plugins/, and node_modules
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
        * Create bad plugin in test/installation/plugins/bad_plugin.js
    * Need to test plugin inheritance
        * Base plugin in test/installation/plugins/base_plugin.js
        * Real plugin in test/installation/plugins/inherits.js
        * Check base methods work
        * Check plugin.base.base_plugin is set/correct
    * Plugin timeouts (already tested)

*/

describe('plugin', () => {

    it('new Plugin() object', () => {
        const pi = new plugin.Plugin(piName);
        assert.ok(pi);
    })

    describe('get_timeout', () => {
        const toPath = path.resolve('config', `${piName}.timeout`);
        it('0s', (done) => {
            fs.writeFile(toPath, '0', () => {
                this.plugin = new plugin.Plugin(piName);
                assert.equal(this.plugin.timeout, 0);
                fs.unlink(toPath, done);
            })
        })

        it('3s', (done) => {
            fs.writeFile(toPath, '3', () => {
                this.plugin = new plugin.Plugin(piName);
                assert.equal(this.plugin.timeout, 3);
                fs.unlink(toPath, done);
            })
        })

        it('60s', (done) => {
            fs.writeFile(toPath, '60', () => {
                this.plugin = new plugin.Plugin(piName);
                assert.equal(this.plugin.timeout, 60);
                fs.unlink(toPath, done);
            })
        })

        it('30s default (overrides NaN)', (done) => {
            fs.writeFile(toPath, 'apple', () => {
                this.plugin = new plugin.Plugin(piName);
                assert.equal(this.plugin.timeout, 30);
                fs.unlink(toPath, done);
            })
        })
    })

    describe('plugin_paths', () => {
        beforeEach((done) => {
            delete process.env.HARAKA;
            done()
        })

        afterEach((done) => {
            delete process.env.HARAKA;
            done()
        })

        it('CORE plugin: (tls)', () => {
            const p = new plugin.Plugin('tls');

            assert.equal(p.plugin_path, path.resolve(__dirname, '..', 'plugins', 'tls.js'));
        })

        it('INSTALLED override: (tls)', () => {
            process.env.HARAKA = path.resolve(__dirname, '..', 'test', 'installation');

            const p = new plugin.Plugin('tls');

            assert.equal(p.plugin_path, path.resolve(__dirname, 'installation', 'plugins', 'tls.js'));
        })

        it('INSTALLED node_modules package plugin: (test-plugin)', () => {
            process.env.HARAKA = path.resolve(__dirname, '..', 'test', 'installation');

            const p = new plugin.Plugin('test-plugin');

            assert.equal(p.plugin_path, path.resolve(__dirname, 'installation', 'node_modules', 'test-plugin', 'package.json'));
            assert.ok(p.hasPackageJson);
            try {
                p._compile();
                assert.ok(true, "compiles OK");
            }
            catch (e) {
                console.error(e.stack);
                assert.ok(false, "compiles OK");
            }
        })

        it('CORE package plugin: redis', () => {
            const p = new plugin.Plugin('haraka-plugin-redis');

            assert.equal(p.plugin_path, path.resolve(__dirname, '..', 'node_modules', 'haraka-plugin-redis', 'package.json'));
            assert.ok(p.hasPackageJson);
        })

        it('plugins overrides node_modules', () => {
            process.env.HARAKA = path.resolve(__dirname, '..', 'test', 'installation');

            const p = new plugin.Plugin('load_first');

            assert.equal(p.plugin_path, path.resolve(__dirname, 'installation', 'plugins', 'load_first.js'));
            try {
                p._compile();
                assert.ok(true, "compiles OK");
            }
            catch (e) {
                console.error(e.stack);
                assert.ok(false, "compiles OK");
            }
            assert.ok(p.loaded_first);
        })

        it('INSTALLED plugins folder plugin: (folder_plugin)', () => {
            process.env.HARAKA = path.resolve(__dirname, '..', 'test', 'installation');

            const p = new plugin.Plugin('folder_plugin');

            assert.equal(p.plugin_path, path.resolve(__dirname, 'installation', 'plugins', 'folder_plugin', 'package.json'));
            assert.ok(p.hasPackageJson);
            try {
                p._compile();
                assert.ok(true, "compiles OK");
            }
            catch (e) {
                console.error(e.stack);
                assert.ok(false, "compiles OK");
            }
        })

        it('Inheritance: (inherits)', () => {
            process.env.HARAKA = path.resolve(__dirname, '..', 'test', 'installation');

            const p = new plugin.Plugin('inherits');

            assert.equal(p.plugin_path, path.resolve(__dirname, 'installation', 'plugins', 'inherits.js'));
            try {
                p._compile();
                assert.ok(true, "compiles OK");
            }
            catch (e) {
                console.error(e.stack);
                assert.ok(false, "compiles OK");
            }
            p.register();
            assert.ok(p.base.base_plugin);
        })
    })

    describe('plugin_config', () => {
        beforeEach((done) => {
            delete process.env.HARAKA;
            done();
        })

        afterEach((done) => {
            delete process.env.HARAKA;
            done();
        })

        it('CORE plugin: (tls)', () => {
            const p = new plugin.Plugin('tls');

            assert.equal(p.config.root_path, path.resolve(__dirname, '..', 'config'));
            assert.equal(p.config.overrides_path, undefined);
        })

        it('INSTALLED override: (tls)', () => {

            process.env.HARAKA = path.resolve(__dirname, '..', 'test', 'installation');

            const p = new plugin.Plugin('tls');

            assert.equal(p.config.root_path, path.resolve(__dirname, '..', 'config'));
            assert.equal(p.config.overrides_path, path.resolve(__dirname, 'installation', 'config'));
            const tls_ini = p.config.get('tls.ini');
            assert.equal(tls_ini.main.ciphers, 'test');
        })

        it('INSTALLED node_modules package plugin: (test-plugin)', () => {

            process.env.HARAKA = path.resolve(__dirname, '..', 'test', 'installation');

            const p = new plugin.Plugin('test-plugin');

            assert.equal(p.config.root_path, path.resolve(__dirname, 'installation', 'node_modules', 'test-plugin', 'config'));
            assert.equal(p.config.overrides_path, path.resolve(__dirname, 'installation', 'config'));
        })
    })
})
