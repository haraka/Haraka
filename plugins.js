// load all defined plugins

var logger      = require('./logger');
var config      = require('./config');
var constants   = require('./constants');
var path        = require('path');
var vm          = require('vm');
var fs          = require('fs');

var plugin_path = process.env.HARAKA ? path.join(process.env.HARAKA, 'plugins') : './plugins';
// These are the hooks that qpsmtpd implements - I should get around
// to supporting them all some day... :-/
var hooks = [
    'connect',
    'pre-connection',
    'connect',
    'ehlo_parse',
    'ehlo',
    'helo_parse',
    'helo',
    'auth_parse',
    'auth',
    'auth-plain',
    'auth-login',
    'auth-cram-md5',
    'rcpt_parse',
    'rcpt_pre',
    'rcpt',
    'mail_parse',
    'mail',
    'mail_pre', 
    'data',
    'data_headers_end',
    'data_post',
    'queue_pre',
    'queue',
    'queue_post',
    'vrfy',
    'noop',
    'quit',
    'reset_transaction',
    'disconnect',
    'post-connection',
    'unrecognized_command',
    'deny',
    'ok',
    'received_line',
    'help'
];

function Plugin(name) {
    this.name = name;
    this.full_path = path.resolve(plugin_path, name) + '.js';
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
        var key_copy = key.slice(0);
        eval("Plugin.prototype." + key_copy + " = function (data) { logger." + key_copy + "(\"[\" + this.name + \"] \" + data); }");
    }
}

var plugins = exports;

plugins.load_plugins = function () {
    logger.loginfo("Loading plugins");
    var plugin_list = config.get('plugins', 'list');
    
    plugins.plugin_list = plugin_list.map(plugins.load_plugin);
};

var constants_str = "";
for (var con in constants) {
    //console.log("Const: " + con);
    constants_str += "var " + con.toUpperCase() + " = " + constants[con] + ";\n";
}

plugins.load_plugin = function(name) {
    logger.loginfo("Loading plugin: " + name);
    
    var plugin = new Plugin(name);
    var code = constants_str + fs.readFileSync(plugin.full_path);
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
    vm.runInNewContext(code, sandbox, name);
    
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

plugins.load_plugins();

plugins.run_hooks = function (hook, connection, params) {
    logger.logdebug("running " + hook + " hooks");
    
    connection.hooks_to_run = [];
    
    for (i = 0; i < plugins.plugin_list.length; i++) {
        var plugin = plugins.plugin_list[i];
        
        if (plugin.hooks[hook]) {
            var j;
            for (j = 0; j < plugin.hooks[hook].length; j++) {
                var hook_code_name = plugin.hooks[hook][j];
                connection.hooks_to_run.push([plugin, hook_code_name]);
            }
        }
    }
    
    plugins.run_next_hook(hook, connection, params);
};

plugins.run_next_hook = function(hook, connection, params) {
    var called_once = 0;
    var timeout_id;
    
    var callback = function(retval, msg) {
        if (timeout_id) clearTimeout(timeout_id);
        
        if (called_once) {
            logger.logerror("callback called multiple times. Ignoring subsequent calls");
            return;
        }
        called_once++;
        if (!retval) retval = constants.cont;
        if (connection.hooks_to_run.length == 0 || 
            retval !== constants.cont)
        {
            var respond_method = hook + "_respond";
            connection[respond_method](retval, msg);
        }
        else {
            plugins.run_next_hook(hook, connection, params);
        }
    }
    
    if (!connection.hooks_to_run.length) return callback();
    
    // shift the next one off the stack and run it.
    var item = connection.hooks_to_run.shift();

    timeout_id = setTimeout(function () {
        logger.logcrit("Plugin " + item[0].name + 
            " timed out - make sure it calls the callback");
        callback(constants.cont, "timeout");
        }, (config.get("plugin_timeout") || 30) * 1000);
        
    try {
        item[0][ item[1] ].call(item[0], callback, connection, params);
    }
    catch (err) {
        logger.logcrit("Plugin " + item[0].name + " failed: " + err);
        callback();
    }
};

