'use strict';
// load all defined plugins

// node built-ins
var fs          = require('fs');
var path        = require('path');
var vm          = require('vm');

// npm modules
var constants   = require('haraka-constants');

// local modules
var logger      = require('./logger');
var config      = require('./config');
var utils       = require('./utils');
var states      = require('./connection').states;

exports.registered_hooks = {};
exports.registered_plugins = {};
exports.plugin_list = [];

var order = 0;

function Plugin (name) {
    this.name = name;
    this.base = {};
    this.timeout = get_timeout(name);
    this._get_plugin_path();
    this.config = this._get_config();
    this.hooks = {};
}

exports.shutdown_plugins = function () {
    for (var i in exports.registered_plugins) {
        if (exports.registered_plugins[i].shutdown) {
            exports.registered_plugins[i].shutdown();
        }
    }
}

process.on('message', function (msg) {
    if (msg.event && msg.event == 'plugins.shutdown') {
        logger.loginfo("[plugins] Shutting down plugins");
        exports.shutdown_plugins();
    }
});

Plugin.prototype.core_require = function (name) {
    return require('./' + name);
};

Plugin.prototype._get_plugin_path = function () {
    var plugin = this;
    /* From https://github.com/haraka/Haraka/pull/1278#issuecomment-168856528
    In Development mode, or install via a plain "git clone":

        Plain plugin in plugins/ folder
        Plugin in a folder in plugins/<name>/ folder. Contains a package.json.
        Plugin in node_modules. Contains a package.json file.

    In "installed" mode (via haraka -i <path>):

        Plain plugin in <path>/plugins/ folder
        Plugin in a folder in <path>/plugins/<name>/folder. (same concept as above)
        Plugin in <path>/node_modules. Contains a package.json file.
        Core plugin in <core_haraka_dir>/plugins/ folder
        Plugin in a folder in <core_haraka_dir>/plugins/<name>/ folder. (same concept as above)
        Plugin in <core_haraka_dir>/node_modules.
    */

    plugin.hasPackageJson = false;
    var name = plugin.name;

    var paths = [];
    if (process.env.HARAKA) {
        // Installed mode - started via bin/haraka
        paths.push(
            path.resolve(process.env.HARAKA, 'plugins', name + '.js'),
            path.resolve(process.env.HARAKA, 'plugins', name, 'package.json'),
            path.resolve(process.env.HARAKA, 'node_modules', name, 'package.json'),
            path.resolve(process.env.HARAKA, 'node_modules', 'haraka-plugin-' + name, 'package.json')
        );
    }

    paths.push(
        path.resolve(__dirname, 'plugins', name + '.js'),
        path.resolve(__dirname, 'plugins', name, 'package.json'),
        path.resolve(__dirname, 'node_modules', name, 'package.json'),
        path.resolve(__dirname, 'node_modules', 'haraka-plugin-' + name, 'package.json')
    );

    paths.forEach(function (pp) {
        if (plugin.plugin_path) return;
        try {
            fs.statSync(pp);
            plugin.plugin_path = pp;
            if (/\/package\.json$/.test(pp)) {
                plugin.hasPackageJson = true;
            }
        }
        catch (ignore) {}
    });
};

Plugin.prototype._get_config = function () {
    if (this.hasPackageJson) {
        // It's a package/folder plugin - look in plugin folder for defaults,
        // haraka/config folder for overrides
        return config.module_config(
            path.dirname(this.plugin_path),
            process.env.HARAKA || __dirname
        );
    }
    if (process.env.HARAKA) {
        // Plain .js file, installed mode - look in core folder for defaults,
        // install dir for overrides
        return config.module_config(__dirname, process.env.HARAKA);
    }

    // Plain .js file, git mode - just look in this folder
    return config.module_config(__dirname);
};

Plugin.prototype.register_hook = function (hook_name, method_name, priority) {
    priority = parseInt(priority);
    if (!priority) priority = 0;
    if (priority > 100) priority = 100;
    if (priority < -100) priority = -100;

    if (!Array.isArray(exports.registered_hooks[hook_name])) {
        exports.registered_hooks[hook_name] = [];
    }
    exports.registered_hooks[hook_name].push({
        plugin: this.name,
        method: method_name,
        priority: priority,
        timeout: this.timeout,
        order: order++
    });
    this.hooks[hook_name] = this.hooks[hook_name] || [];
    this.hooks[hook_name].push(method_name);

    logger.logdebug("registered hook " + hook_name +
                    " to " + this.name + '.' + method_name +
                    " priority " + priority);
};

Plugin.prototype.register = function () {}; // noop

Plugin.prototype.inherits = function (parent_name) {
    var parent_plugin = plugins._load_and_compile_plugin(parent_name);
    for (var method in parent_plugin) {
        if (!this[method]) {
            this[method] = parent_plugin[method];
        }
        // else if (method == 'shutdown') { // Method is in this module, so it exists in the plugin
        //     if (!this.hasOwnProperty('shutdown')) {
        //         this[method] = parent_plugin[method];
        //     }
        // }
    }
    if (parent_plugin.register) {
        parent_plugin.register.call(this);
    }
    this.base[parent_name] = parent_plugin;
};

Plugin.prototype._make_custom_require = function () {
    var plugin = this;
    return function (module) {
        if (plugin.hasPackageJson) {
            var mod = require(module);
            constants.import(global);
            global.server = plugins.server;
            return mod;
        }

        if (module === './config') {
            return plugin.config;
        }

        if (!/^\./.test(module)) {
            return require(module);
        }

        if (utils.existsSync(__dirname + '/' + module + '.js') ||
            utils.existsSync(__dirname + '/' + module)) {
            return require(module);
        }

        return require(path.dirname(plugin.plugin_path) + '/' + module);
    };
};

Plugin.prototype._get_code = function (pp) {
    var plugin = this;

    if (plugin.hasPackageJson) {
        return 'var _p = require("' + path.dirname(pp) + '"); for (var k in _p) { exports[k] = _p[k] }';
    }

    try {
        return '"use strict";' + fs.readFileSync(pp);
    }
    catch (err) {
        if (config.get('smtp.ini').main.ignore_bad_plugins) {
            logger.logcrit('Loading plugin ' + name + ' failed: ' + err);
            return;
        }
        throw 'Loading plugin ' + name + ' failed: ' + err;
    }
}

Plugin.prototype._compile = function () {
    var plugin = this;

    var pp = plugin.plugin_path;
    var code = plugin._get_code(pp);
    if (!code) return;

    var sandbox = {
        require: plugin._make_custom_require(),
        __filename: pp,
        __dirname:  path.dirname(pp),
        exports: plugin,
        setTimeout: setTimeout,
        clearTimeout: clearTimeout,
        setInterval: setInterval,
        clearInterval: clearInterval,
        process: process,
        Buffer: Buffer,
        Math: Math,
        server: plugins.server,
    };
    if (plugin.hasPackageJson) {
        delete sandbox.__filename;
    }
    constants.import(sandbox);
    try {
        vm.runInNewContext(code, sandbox, pp);
    }
    catch (err) {
        logger.logcrit('Compiling plugin: ' + plugin.name + ' failed');
        if (config.get('smtp.ini').main.ignore_bad_plugins) {
            logger.logcrit('Loading plugin ' + plugin.name + ' failed: ',
                err.message + ' - will skip this plugin and continue');
            return;
        }
        throw err; // default is to re-throw and stop Haraka
    }

    return plugin;
};

function get_timeout (name) {
    var timeout = parseFloat((config.get(name + '.timeout')));
    if (isNaN(timeout)) {
        logger.logdebug('no timeout in ' + name + '.timeout');
        timeout = parseFloat(config.get('plugin_timeout'));
    }
    if (isNaN(timeout)) {
        logger.logdebug('no timeout in plugin_timeout');
        timeout = 30;
    }

    logger.logdebug('plugin ' + name + ' timeout is: ' + timeout + 's');
    return timeout;
}

// copy logger methods into Plugin:
for (var key in logger) {
    if (!/^log\w/.test(key)) continue;
    // console.log('adding Plugin.' + key + ' method');
    Plugin.prototype[key] = (function (lev) {
        return function () {
            var args = [this];
            for (var i=0, l=arguments.length; i<l; i++) {
                args.push(arguments[i]);
            }
            logger[lev].apply(logger, args);
        };
    })(key);
}

var plugins = exports;

plugins.Plugin = Plugin;

plugins.load_plugins = function (override) {
    logger.loginfo("Loading plugins");
    var plugin_list;
    if (override) {
        if (!Array.isArray(override)) override = [ override ];
        plugin_list = override;
    }
    else {
        plugin_list = config.get('plugins', 'list');
    }

    plugin_list.forEach(function (plugin) {
        plugins.load_plugin(plugin);
    });

    plugins.plugin_list = Object.keys(plugins.registered_plugins);

    // Sort registered_hooks by priority
    var hooks = Object.keys(plugins.registered_hooks);
    for (var h=0; h<hooks.length; h++) {
        var hook = hooks[h];
        plugins.registered_hooks[hook].sort(function (a, b) {
            if (a.priority < b.priority) return -1;
            if (a.priority > b.priority) return 1;
            if (a.priority == b.priority) {
                if (a.order > b.order) return 1;
                return -1;
            }
            return 0;
        });
    }

    logger.dump_logs(); // now logging plugins are loaded.
};

plugins.load_plugin = function (name) {
    logger.loginfo('Loading plugin: ' + name);

    var plugin = plugins._load_and_compile_plugin(name);
    if (plugin) {
        plugins._register_plugin(plugin);
    }

    plugins.registered_plugins[name] = plugin;
    return plugin;
};

// Set in server.js; initialized to empty object
// to prevent it from blowing up any unit tests.
plugins.server = { notes: {} };

plugins._load_and_compile_plugin = function (name) {
    var plugin = new Plugin(name);
    if (!plugin.plugin_path) {
        var err = 'Loading plugin ' + plugin.name +
            ' failed: No plugin with this name found';
        if (config.get('smtp.ini').main.ignore_bad_plugins) {
            logger.logcrit(err);
            return;
        }
        throw err;
    }
    plugin._compile();
    return plugin;
};

plugins._register_plugin = function (plugin) {
    plugin.register();

    // register any hook_blah methods.
    for (var method in plugin) {
        var result = method.match(/^hook_(\w+)\b/);
        if (result) {
            plugin.register_hook(result[1], method);
        }
    }

    return plugin;
};

plugins.run_hooks = function (hook, object, params) {
    if (client_disconnected(object)) {
        if (hook !== 'log') {
            object.logdebug('aborting ' + hook + ' hook');
        }
        return;
    }

    if (hook !== 'log') object.logdebug('running ' + hook + ' hooks');

    if (/^(reset_transaction|disconnect)$/.test(hook) && object.current_hook) {
        object.current_hook[2](); // call cancel function
    }

    if (!/^(reset_transaction|disconnect|deny|log)$/.test(hook) &&
        object.hooks_to_run && object.hooks_to_run.length)
    {
        throw new Error('We are already running hooks! Fatal error!');
    }

    if (hook === 'deny') {
        // Save the hooks_to_run list so that we can run any remaining
        // plugins on the previous hook once this hook is complete.
        object.saved_hooks_to_run = object.hooks_to_run;
    }
    object.hooks_to_run = [];

    if (plugins.registered_hooks[hook]) {
        for (var i=0; i<plugins.registered_hooks[hook].length; i++) {
            var item = plugins.registered_hooks[hook][i];
            var plugin = plugins.registered_plugins[item.plugin];
            object.hooks_to_run.push([plugin, item.method]);
        }
    }

    plugins.run_next_hook(hook, object, params);
};

plugins.run_next_hook = function (hook, object, params) {
    if (client_disconnected(object)) {
        object.logdebug('aborting ' + hook + ' hook');
        return;
    }
    var called_once = false;
    var timeout_id;
    var timed_out = false;
    var cancelled = false;
    var cancel = function () { cancelled = true; };
    var item;
    var callback = function (retval, msg) {
        if (timeout_id) clearTimeout(timeout_id);
        object.current_hook = null;
        if (cancelled) return; // This hook has been cancelled

        // Bail if client has disconnected
        if (client_disconnected(object)) {
            object.logdebug('ignoring ' + item[0].name + ' plugin callback');
            return;
        }
        if (called_once && hook !== 'log') {
            if (!timed_out) {
                object.logerror(item[0].name + ' plugin ran callback ' +
                        'multiple times - ignoring subsequent calls');
                // Write a stack trace to the log to aid debugging
                object.logerror((new Error()).stack);
            }
            return;
        }
        called_once = true;
        if (!retval) retval = constants.cont;

        log_run_item(item, hook, retval, object, params, msg);

        if (object.hooks_to_run.length !== 0) {
            if (retval === constants.cont) {
                return plugins.run_next_hook(hook, object, params);
            }
            if (/^(connect_init|disconnect)$/.test(hook)) {
                // these hooks ignore retval and always run for every plugin
                return plugins.run_next_hook(hook, object, params);
            }
        }

        var respond_method = hook + '_respond';
        if (item && is_deny_retval(retval) && hook.substr(0,5) !== 'init_') {
            object.deny_respond =
                get_denyfn(object, hook, params, retval, msg, respond_method);
            plugins.run_hooks('deny', object,
                [retval, msg, item[0].name, item[1], params, hook]);
        }
        else {
            object.hooks_to_run = [];
            object[respond_method](retval, msg, params);
        }
    };

    if (!object.hooks_to_run.length) return callback();

    // shift the next one off the stack and run it.
    item = object.hooks_to_run.shift();
    item.push(cancel);

    if (hook !== 'log' && item[0].timeout) {
        timeout_id = setTimeout(function () {
            timed_out = true;
            object.logcrit('Plugin ' + item[0].name + ' timed out on hook ' +
                    hook + ' - make sure it calls the callback');
            callback(constants.denysoft, 'plugin timeout');
        }, item[0].timeout * 1000);
    }

    if (hook !== 'log') {
        object.logdebug('running ' + hook + ' hook in ' +
                item[0].name + ' plugin');
    }

    try {
        object.current_hook = item;
        object.hook = hook;
        item[0][ item[1] ].call(item[0], callback, object, params);
    }
    catch (err) {
        if (hook !== 'log') {
            object.logcrit('Plugin ' + item[0].name + ' failed: ' +
                    (err.stack || err));
        }
        callback();
    }
};

function client_disconnected (object) {
    if (object.constructor.name === 'Connection' &&
        object.state >= states.DISCONNECTING) {
        object.logdebug('client has disconnected');
        return true;
    }
    return false;
}

function log_run_item (item, hook, retval, object, params, msg) {
    if (!item) return;
    if (hook === 'log') return;

    var log = 'logdebug';
    var is_not_cont = (retval !== constants.cont &&
                       logger.would_log(logger.LOGINFO));
    if (is_not_cont) log = 'loginfo';
    if (is_not_cont || logger.would_log(logger.LOGDEBUG)) {
        object[log]([
            'hook='     + hook,
            'plugin='   + item[0].name,
            'function=' + item[1],
            'params="'  + ((params) ? ((typeof params === 'string') ?
                            params : params[0]) : '') + '"',
            'retval='   + constants.translate(retval),
            'msg="'     + ((msg) ? msg : '') + '"',
        ].join(' '));
    }
}

function is_deny_retval (val) {
    switch (val) {
        case constants.deny:
        case constants.denysoft:
        case constants.denydisconnect:
        case constants.denysoftdisconnect:
            return true;
    }
    return false;
}

function get_denyfn (object, hook, params, retval, msg, respond_method) {
    return function (deny_retval, deny_msg) {
        switch (deny_retval) {
            case constants.ok:
                // Override rejection
                object.loginfo('deny(soft?) overriden by deny hook' +
                                (deny_msg ? ': ' + deny_msg : ''));
                // Restore hooks_to_run with saved copy so that
                // any other plugins on this hook can also run.
                if (object.saved_hooks_to_run.length > 0) {
                    object.hooks_to_run = object.saved_hooks_to_run;
                    plugins.run_next_hook(hook, object, params);
                }
                else {
                    object[respond_method](constants.cont, deny_msg, params);
                }
                break;
            default:
                object.saved_hooks_to_run = [];
                object.hooks_to_run = [];
                object[respond_method](retval, msg, params);
        }
    };
}
