// load all defined plugins

var logger      = require('./logger');
var config      = require('./config');
var constants   = require('./constants');
var path        = require('path');
var vm          = require('vm');
var fs          = require('fs');
var utils       = require('./utils');
var util = require('util');

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

function Plugin(name) {
    this.name = name;
    this.timeout = config.get(name + '.timeout', 'nolog');
    if (this.timeout === null) {
        this.timeout = config.get('plugin_timeout', 'nolog') || 30;
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

// copy logger methods into Plugin:

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

plugins.load_plugins = function () {
    logger.loginfo("Loading plugins");
    var plugin_list = config.get('plugins', 'nolog', 'list');
    
    plugins.plugin_list = plugin_list.map(plugins.load_plugin);
};

var constants_str = "";
for (var con in constants) {
    constants_str += "var " + con.toUpperCase() + " = " + constants[con] + "; ";
}

plugins.load_plugin = function(name) {
    logger.loginfo("Loading plugin: " + name);
    
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
        if (config.get('smtp.ini', 'nolog', 'ini').main.ignore_bad_plugins) {
            logger.logcrit("Loading plugin " + name + " failed: " + last_err);
            return;
        }
        throw "Loading plugin " + name + " failed: " + last_err;
    }
    var code = constants_str + rf;
    var sandbox = { 
        require: require,
        exports: plugin,
        setTimeout: setTimeout,
        clearTimeout: clearTimeout,
        setInterval: setInterval,
        clearInterval: clearInterval,
        process: process,
        Buffer: Buffer
    };
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
    
    // register any hook_blah methods.
    for (var method in plugin) {
        var result;
        if (result = method.match(/^hook_(\w+)\b/)) {
            plugin.register_hook(result[1], method);
        }
    }
    
    plugin.register();
    
    return plugin;
}

plugins.run_hooks = function (hook, object, params) {
    if (hook != 'log')
        object.logdebug("running " + hook + " hooks");
    
    if (regular_hooks[hook] && object.hooks_to_run.length) {
        throw new Error("We are already running hooks! Fatal error!");
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
                if (hook != 'log')
                    object.loginfo("plugin returned deny(soft?): ", msg);
                object.deny_respond = function () {
                    object.hooks_to_run = [];
                    object[respond_method](retval, msg);
                };
                plugins.run_hooks('deny', object, [retval, msg, item[0].name, item[1], params]);
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

