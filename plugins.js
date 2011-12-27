"use strict";
// load all defined plugins

var logger      = require('./logger');
var config      = require('./config');
var constants   = require('./constants');
var path        = require('path');
var vm          = require('vm');
var fs          = require('fs');
var utils       = require('./utils');
var util        = require('util');

var plugin_paths = [path.join(__dirname, './plugins')];
if (process.env.HARAKA) { plugin_paths.unshift(path.join(process.env.HARAKA, 'plugins')); }

function Plugin(name) {
    this.name = name;
    this.timeout = config.get(name + '.timeout');
    if (this.timeout === null) {
        this.timeout = config.get('plugin_timeout') || 30;
    }
    else {
        logger.logdebug("plugin " + name + " set timeout to: " + this.timeout + "s");
    }
    var full_paths = []
    plugin_paths.forEach(function (pp) {
        full_paths.push(path.resolve(pp, name) + '.js');
    });
    this.full_paths = full_paths;
    this.config = config;
    this.hooks = {};
};

Plugin.prototype.register_hook = function(hook_name, method_name) {
    this.hooks[hook_name] = this.hooks[hook_name] || [];
    this.hooks[hook_name].push(method_name);
    
    logger.logdebug("registered hook " + hook_name + " to " + this.name + "." + method_name);
}

Plugin.prototype.register = function () {}; // noop

Plugin.prototype.inherits = function (parent_name) {
    var parent_plugin = plugins._load_and_compile_plugin(parent_name);
    for (var method in parent_plugin) {
        if (!this[method]) {
            this[method] = parent_plugin[method];
        }
    }
    if (parent_plugin.register) {
        parent_plugin.register.call(this);
    }
    this.base = parent_plugin;
}

// copy logger methods into Plugin:

for (var key in logger) {
    if (key.match(/^log\w/)) {
        // console.log("adding Plugin." + key + " method");
        Plugin.prototype[key] = (function (key) {
            return function () {
                var args = [this];
                for (var i=0, l=arguments.length; i<l; i++) {
                    args.push(arguments[i]);
                }
                logger[key].apply(logger, args);
            }
        })(key);
    }
}

var plugins = exports;

plugins.Plugin = Plugin;

plugins.load_plugins = function () {
    logger.loginfo("Loading plugins");
    var plugin_list = config.get('plugins', 'list');
    
    plugins.plugin_list = plugin_list.map(plugins.load_plugin);
    logger.dump_logs(); // now logging plugins are loaded.
};

plugins.load_plugin = function(name) {
    logger.loginfo("Loading plugin: " + name);

    var plugin = plugins._load_and_compile_plugin(name);
    if (plugin) {
        plugins._register_plugin(plugin);
    }

    return plugin;
}

plugins._load_and_compile_plugin = function(name) {
    var plugin = new Plugin(name);
    var fp = plugin.full_paths,
        rf, last_err;
    for (var i=0, j=fp.length; i<j; i++) {
        try {
            rf = fs.readFileSync(fp[i]);
            break;
        }
        catch (err) {
            last_err = err;
            continue;
        }
    }
    if (!rf) {
        if (config.get('smtp.ini').main.ignore_bad_plugins) {
            logger.logcrit("Loading plugin " + name + " failed: " + last_err);
            return;
        }
        throw "Loading plugin " + name + " failed: " + last_err;
    }
    var code = '"use strict";' + rf;
    var sandbox = { 
        require: require,
        __filename: fp[i],
        __dirname:  path.dirname(fp[i]),
        exports: plugin,
        setTimeout: setTimeout,
        clearTimeout: clearTimeout,
        setInterval: setInterval,
        clearInterval: clearInterval,
        process: process,
        Buffer: Buffer,
    };
    constants.import(sandbox);
    try {
        vm.runInNewContext(code, sandbox, name);
    }
    catch (err) {
        logger.logcrit("Compiling plugin: " + name + " failed");
        if (config.get('smtp.ini').main.ignore_bad_plugins) {
            logger.logcrit("Loading plugin " + name + " failed: ", err.message
                           + " - will skip this plugin and continue");
            return;
        }
        throw err; // default is to re-throw and stop Haraka
    }
    
    return plugin;
}

plugins._register_plugin = function (plugin) {
    plugin.register();
    
    // register any hook_blah methods.
    for (var method in plugin) {
        var result;
        if (result = method.match(/^hook_(\w+)\b/)) {
            plugin.register_hook(result[1], method);
        }
    }
    
    return plugin;
}

plugins.run_hooks = function (hook, object, params) {
    if (hook != 'log')
        object.logdebug("running " + hook + " hooks");
    
    if (hook != 'deny' && hook != 'log' && object.hooks_to_run && object.hooks_to_run.length) {
        throw new Error("We are already running hooks! Fatal error!");
    }

    if (hook === 'deny') {
        // Save the hooks_to_run list so that we can run any remaining 
        // plugins on the previous hook once this hook is complete.
        object.saved_hooks_to_run = object.hooks_to_run;
    }
    object.hooks_to_run = [];
    
    for (var i = 0; i < plugins.plugin_list.length; i++) {
        var plugin = plugins.plugin_list[i];
        
        if (plugin && plugin.hooks[hook]) {
            var j;
            for (j = 0; j < plugin.hooks[hook].length; j++) {
                var hook_code_name = plugin.hooks[hook][j];
                object.hooks_to_run.push([plugin, hook_code_name]);
            }
        }
    }
    
    plugins.run_next_hook(hook, object, params);
};

plugins.run_next_hook = function(hook, object, params) {
    var called_once = 0;
    var timeout_id;
    
    var item;
    var callback = function(retval, msg) {
        if (timeout_id) clearTimeout(timeout_id);
        
        if (called_once) {
            if (hook != 'log')
                object.logerror("callback called multiple times. Ignoring subsequent calls");
            return;
        }
        called_once++;
        if (!retval) retval = constants.cont;
        if (object.hooks_to_run.length == 0 || 
            retval !== constants.cont)
        {
            var respond_method = hook + "_respond";
            if (item && utils.in_array(retval, [constants.deny, constants.denysoft, constants.denydisconnect])) {
                if (hook != 'log') {
                    object.loginfo("plugin returned deny(soft?): ", msg);
                }
                object.deny_respond = function (deny_retval, deny_msg) {
                    switch(deny_retval) {
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
                                object[respond_method](constants.cont, deny_msg);
                            }
                            break;
                        default:
                            object.saved_hooks_to_run = [];
                            object.hooks_to_run = [];
                            object[respond_method](retval, msg);
                    }
                };
                plugins.run_hooks('deny', object, [retval, msg, item[0].name, item[1], params, hook]);
            }
            else {
                object.hooks_to_run = [];
                object[respond_method](retval, msg, params);
            }
        }
        else {
            plugins.run_next_hook(hook, object, params);
        }
    }
    
    if (!object.hooks_to_run.length) return callback();
    
    // shift the next one off the stack and run it.
    item = object.hooks_to_run.shift();

    if (item[0].timeout && hook != 'log') {
        timeout_id = setTimeout(function () {
            object.logcrit("Plugin " + item[0].name + 
                " timed out - make sure it calls the callback");
            callback(constants.denysoft, "timeout");
        }, item[0].timeout * 1000);
    }
    
    if (hook != 'log')
        object.logdebug("running " + hook + " hook in " + item[0].name + " plugin");
    
    try {
        object.current_hook = item;
        item[0][ item[1] ].call(item[0], callback, object, params);
    }
    catch (err) {
        if (hook != 'log') {
            object.logcrit("Plugin " + item[0].name + " failed: " + (err.stack || err));
        }
        callback();
    }
};

