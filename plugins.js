// load all defined plugins

var logger      = require('./logger');
var config      = require('./config');
var constants   = require('./constants');
var path        = require('path');
var vm          = require('vm');
var fs          = require('fs');
var utils       = require('./utils');
var util        = require('util');

// @TODO remove "./". It's not needed (I think) and it's potentially danagerous for Windoof servers
// @TODO this is more or less the same as in config.js and haraka.js. For consistency reasons it might be better centralized in one lib/place
var plugin_paths = [path.join(__dirname, './plugins')];
if (process.env.HARAKA) { plugin_paths.unshift(path.join(process.env.HARAKA, 'plugins')); }

// These are the hooks that qpsmtpd implements - I should get around
// to supporting them all some day... :-/
var regular_hooks = {
    'connect':1,
    'pre-connection': 1,
    'connect': 1,
    'ehlo_parse': 1,
    'ehlo': 1,
    'helo_parse': 1,
    'helo': 1,
    'auth_parse': 1,
    'auth': 1,
    'auth-plain': 1,
    'auth-login': 1,
    'auth-cram-md5': 1,
    'rcpt_parse': 1,
    'rcpt_pre': 1,
    'rcpt': 1,
    'mail_parse': 1,
    'mail': 1,
    'mail_pre': 1, 
    'data': 1,
    'data_headers_end': 1,
    'data_post': 1,
    'queue_pre': 1,
    'queue': 1,
    'queue_post': 1,
    'vrfy': 1,
    'noop': 1,
    'quit': 1,
    'reset_transaction': 1,
    'disconnect': 1,
    'unrecognized_command': 1,
    'help': 1
};

/**
 * Constructor for a Plugin object
 * 
 * @param name The name of the plugin
 */
function Plugin(name) {
    this.name = name;
    
    // Every plugin can have a <name>.timeout config with one value: the timeout
    this.timeout = config.get(name + '.timeout', 'nolog');
    if (this.timeout === null) {
    	// If not present, than try the plugin_timeout config file.
    	// If plugin_timeout doesn't exist, than use system default 
    	// @TODO move system default into global var or haraka provided global system settings
        this.timeout = config.get('plugin_timeout', 'nolog') || 30;
    }
    // @TODO Shouldn't the "else" be removed?
    else {
        logger.logdebug("plugin " + name + " set timeout to: " + this.timeout + "s");
    }
    var full_paths = []
    plugin_paths.forEach(function (pp) {
    	// @?? Does push() do nothing with an emtpy value? E.g. in case resolve() doesn't find the file.
        full_paths.push(path.resolve(pp, name) + '.js');
    });
    this.full_paths = full_paths;
    this.config = config;
    this.hooks = {};
};

/**
 * Add register_hook() function to all Plugin instances
 * 
 * @param hook_name 
 * @param method_name
 */
Plugin.prototype.register_hook = function(hook_name, method_name) {
    this.hooks[hook_name] = this.hooks[hook_name] || [];
    this.hooks[hook_name].push(method_name);
    
    logger.logdebug("registered hook " + hook_name + " to " + this.name + "." + method_name);
}

/**
 * Add register() function to all Plugin instances
 */
Plugin.prototype.register = function () {}; // noop

/**
 * Add inherits() function to all Plugin instances. The method allows plugins to inherit from other plugins.
 * 
 * @param parent_name
 */
Plugin.prototype.inherits = function (parent_name) {
    var parent_plugin = plugins._load_and_compile_plugin(parent_name);
    for (var method in parent_plugin) {
        if (!this[method]) {
            this[method] = parent_plugin[method];
        }
    }

    // @?? Should all Plugins have a register() method because of the prototype above?
    if (parent_plugin.register) {
        parent_plugin.register.call(this);
    }
}

// copy logger methods into Plugin:
// @TODO why is this necessary? Same code as in server.js => utils.js
for (var key in logger) {
    if (key.match(/^log\w/)) {
        // console.log("adding Plugin." + key + " method");
        Plugin.prototype[key] = (function (key) {
            return function () {
                var args = ["[" + this.name + "] "];
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

/**
 * Load all plugins listed in config/plugins
 */
plugins.load_plugins = function () {
    logger.loginfo("Loading plugins");
    var plugin_list = config.get('plugins', 'nolog', 'list');
    
    plugins.plugin_list = plugin_list.map(plugins.load_plugin);
};

/**
 * Load, compile and register the plugin with 'name'
 */
plugins.load_plugin = function(name) {
    logger.loginfo("Loading plugin: " + name);

    var plugin = plugins._load_and_compile_plugin(name);
    plugins._register_plugin(plugin);

    return plugin;
}

/**
 * Load and compile the plugin with 'name'
 */
plugins._load_and_compile_plugin = function(name) {
    var plugin = new Plugin(name);
    var fp = plugin.full_paths, rf, last_err;

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
        if (config.get('smtp.ini', 'nolog', 'ini').main.ignore_bad_plugins) {
            logger.logcrit("Loading plugin " + name + " failed: " + last_err);
            return;
        }
        throw "Loading plugin " + name + " failed: " + last_err;
    }

    var code = rf;
    var sandbox = { 
        require: require,
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
        if (config.get('smtp.ini', 'nolog', 'ini').main.ignore_bad_plugins) {
            logger.logcrit("Loading plugin " + name + " failed: ", err.stack);
            return;
        }
        throw err; // default is to re-throw and stop Haraka
    }
    
    return plugin;
}

/**
 * Register the plugin
 */
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

/**
 * @param hook
 * @param object
 * @param params
 */
plugins.run_hooks = function (hook, object, params) {
    if (hook != 'log')
        object.logdebug("running " + hook + " hooks");
    
    if (regular_hooks[hook] && object.hooks_to_run.length) {
        throw new Error("We are already running hooks! Fatal error!");
    }

    if (hook === 'deny') {
        // Save the hooks_to_run list so that we can run any remaining 
        // plugins on the previous hook once this hook is complete.
        object.saved_hooks_to_run = object.hooks_to_run;
    }
    object.hooks_to_run = [];
    
    for (i = 0; i < plugins.plugin_list.length; i++) {
        var plugin = plugins.plugin_list[i];
        
        if (plugin.hooks[hook]) {
            var j;
            for (j = 0; j < plugin.hooks[hook].length; j++) {
                var hook_code_name = plugin.hooks[hook][j];
                object.hooks_to_run.push([plugin, hook_code_name]);
            }
        }
    }
    
    plugins.run_next_hook(hook, object, params);
};

/**
 * @param hook
 * @param object
 * @param params
 */
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

